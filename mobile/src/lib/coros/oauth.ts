import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { startLoopback } from './loopback';

// 高驰不接受自定义 scheme。登录会话在浏览器里完成，授权码回到手机本机 127.0.0.1。
const SCOPE = 'openid offline_access mcp.tools';
const HOSTS = { cn: 'https://mcpcn.coros.com', us: 'https://mcpus.coros.com' } as const;
const STORE_KEY = 'coros.session';

export type Region = keyof typeof HOSTS;

export interface CorosSession {
  region: Region;
  clientId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

interface ServerMeta {
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  revocation_endpoint?: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as { corosRegion?: Region };
export const defaultRegion: Region = extra.corosRegion ?? 'cn';

export const mcpUrl = (region: Region) => `${HOSTS[region]}/mcp`;

function b64url(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += chars[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += chars[n & 63];
  }
  return out;
}

async function serverMeta(region: Region): Promise<ServerMeta> {
  const res = await fetch(`${HOSTS[region]}/.well-known/oauth-authorization-server`);
  if (!res.ok) throw new Error(`读取 COROS 授权服务器元数据失败：${res.status}`);
  return res.json();
}

async function postForm(url: string, body: Record<string, string>) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description ?? json.error ?? `HTTP ${res.status}`);
  return json as { access_token: string; refresh_token?: string; expires_in: number };
}

// expo-secure-store 不支持 web，web 端仅用于开发调试，退回 localStorage
const secure = {
  get: (k: string) => (Platform.OS === 'web' ? Promise.resolve(localStorage.getItem(k)) : SecureStore.getItemAsync(k)),
  set: (k: string, v: string) => (Platform.OS === 'web' ? Promise.resolve(localStorage.setItem(k, v)) : SecureStore.setItemAsync(k, v)),
  del: (k: string) => (Platform.OS === 'web' ? Promise.resolve(localStorage.removeItem(k)) : SecureStore.deleteItemAsync(k)),
};

export async function loadSession(): Promise<CorosSession | null> {
  const raw = await secure.get(STORE_KEY);
  return raw ? (JSON.parse(raw) as CorosSession) : null;
}

async function saveSession(s: CorosSession) {
  await secure.set(STORE_KEY, JSON.stringify(s));
}

async function registerClient(meta: ServerMeta, redirectUri: string): Promise<string> {
  const res = await fetch(meta.registration_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'betterToday',
      redirect_uris: [redirectUri],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: SCOPE,
    }),
  });
  const json = (await res.json()) as { client_id?: string; error_description?: string };
  if (!json.client_id) throw new Error(`客户端注册失败：${json.error_description ?? '未知错误'}`);
  return json.client_id;
}

function authorizeUrl(meta: ServerMeta, clientId: string, redirectUri: string, challenge: string, state: string, region: Region) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: mcpUrl(region),
  });
  return `${meta.authorization_endpoint}?${params}`;
}

/** 官方技能使用的登录会话：浏览器里登录，App 轮询，不必让浏览器跳回 App。 */
async function cliLogin(issuer: string, clientId: string): Promise<{ loginUrl: string; sessionId: string; pollToken: string } | null> {
  const res = await fetch(`${issuer}/api/v1/cli/login-sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { loginUrl?: string; sessionId?: string; pollToken?: string };
  if (!json.loginUrl || !json.sessionId || !json.pollToken) return null;
  return { loginUrl: json.loginUrl, sessionId: json.sessionId, pollToken: json.pollToken };
}

async function pollTicket(issuer: string, sessionId: string, pollToken: string): Promise<string> {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const res = await fetch(`${issuer}/api/v1/cli/login-sessions/${sessionId}/claim`, {
      method: 'POST',
      headers: { 'X-Poll-Token': pollToken },
    });
    const json = (await res.json()) as { status?: string; loginTicket?: string; errorCode?: string; error_description?: string };
    if (!res.ok) throw new Error(json.error_description ?? '登录状态查询失败');
    const status = String(json.status ?? '').toLowerCase();
    if (status === 'authorized' && json.loginTicket) return json.loginTicket;
    if (status === 'pending') {
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    throw new Error(status === 'expired' ? '登录已过期，请重试' : `登录失败：${json.errorCode ?? status}`);
  }
  throw new Error('登录超时，请重试');
}

async function browse(url: string, until: () => Promise<void>) {
  // 浏览器关掉只代表用户回到了 App，不代表登录失败。回到 App 之后再等一会儿，让轮询拿到结果。
  let finished = false;
  const work = until().finally(() => {
    finished = true;
  });
  const closed = WebBrowser.openBrowserAsync(url).then(
    () =>
      new Promise<void>((resolve, reject) => {
        setTimeout(() => (finished ? resolve() : reject(new Error('登录没完成。到设置里点「连接 COROS」，在浏览器里点允许授权。'))), 45_000);
      }),
  );
  try {
    await Promise.race([work, closed]);
  } finally {
    finished = true;
    WebBrowser.dismissBrowser();
  }
}

export async function signIn(region: Region = defaultRegion): Promise<CorosSession> {
  if (Platform.OS === 'web') throw new Error('请在手机上的 betterToday 里连接 COROS');
  const meta = await serverMeta(region);
  const issuer = new URL(meta.authorization_endpoint).origin;
  const verifier = b64url(Crypto.getRandomBytes(32));
  const challenge = b64url(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new TextEncoder().encode(verifier))));
  const state = b64url(Crypto.getRandomBytes(16));
  const loop = await startLoopback(state);
  try {
    const clientId = await registerClient(meta, loop.redirectUri);
    const authUrl = authorizeUrl(meta, clientId, loop.redirectUri, challenge, state, region);
    const cli = await cliLogin(issuer, clientId);
    if (cli) {
      await browse(cli.loginUrl, async () => {
        const ticket = await pollTicket(issuer, cli.sessionId, cli.pollToken);
        const joiner = authUrl.includes('?') ? '&' : '?';
        await fetch(`${authUrl}${joiner}login_ticket=${encodeURIComponent(ticket)}`).catch(() => undefined);
        await loop.waitForCallback();
      });
    } else {
      await browse(authUrl, () => loop.waitForCallback().then(() => undefined));
    }
    const { code } = await loop.waitForCallback();
    const token = await postForm(meta.token_endpoint, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: loop.redirectUri,
      client_id: clientId,
      code_verifier: verifier,
    });
    const session: CorosSession = {
      region,
      clientId,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + token.expires_in * 1000,
    };
    await saveSession(session);
    return session;
  } finally {
    loop.close();
  }
}

export async function validSession(): Promise<CorosSession> {
  const s = await loadSession();
  if (!s) throw new Error('尚未连接 COROS');
  if (Date.now() < s.expiresAt - 60_000) return s;
  if (!s.refreshToken) throw new Error('登录已过期，请重新连接 COROS');
  const meta = await serverMeta(s.region);
  const token = await postForm(meta.token_endpoint, { grant_type: 'refresh_token', refresh_token: s.refreshToken, client_id: s.clientId });
  const next: CorosSession = {
    ...s,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? s.refreshToken,
    expiresAt: Date.now() + token.expires_in * 1000,
  };
  await saveSession(next);
  return next;
}

export async function signOut() {
  const s = await loadSession();
  await secure.del(STORE_KEY);
  if (!s) return;
  const meta = await serverMeta(s.region).catch(() => null);
  if (meta?.revocation_endpoint && s.refreshToken) {
    await postForm(meta.revocation_endpoint, { token: s.refreshToken, client_id: s.clientId }).catch(() => undefined);
  }
}
