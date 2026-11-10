#!/usr/bin/env node
// COROS MCP 通路探针：动态注册 + OAuth 2.1 PKCE（回环回调）+ MCP tools/list / tools/call
// 用法：
//   node tools/coros-probe.mjs login [cn|us]
//   node tools/coros-probe.mjs list
//   node tools/coros-probe.mjs call <toolName> '<jsonArgs>'
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const STATE_FILE = path.join(HERE, '.coros-session.json');
const OUT_DIR = path.join(HERE, '..', 'docs', 'coros-mcp');
const REDIRECT = 'http://127.0.0.1:8765/callback';
const SCOPE = 'openid mcp.tools offline_access';
const HOSTS = { cn: 'https://mcpcn.coros.com', us: 'https://mcpus.coros.com' };

const b64url = (buf) => buf.toString('base64url');
const loadState = () => (fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : null);
const saveState = (s) => fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2), { mode: 0o600 });

async function postForm(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${url} ${res.status} ${JSON.stringify(json)}`);
  return json;
}

async function login(region = 'cn') {
  const host = HOSTS[region];
  const meta = await (await fetch(`${host}/.well-known/oauth-authorization-server`)).json();
  const reg = await (
    await fetch(meta.registration_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'NowORNever probe',
        redirect_uris: [REDIRECT],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: SCOPE,
      }),
    })
  ).json();

  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));
  const authUrl = new URL(meta.authorization_endpoint);
  Object.entries({
    response_type: 'code',
    client_id: reg.client_id,
    redirect_uri: REDIRECT,
    scope: SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: `${host}/mcp`,
  }).forEach(([k, v]) => authUrl.searchParams.set(k, v));

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, REDIRECT);
      if (u.pathname !== '/callback') return res.end();
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<h2>授权完成，可以关闭此页面。</h2>');
      server.close();
      if (u.searchParams.get('state') !== state) return reject(new Error('state 不匹配'));
      if (u.searchParams.get('error')) return reject(new Error(u.searchParams.get('error_description') || u.searchParams.get('error')));
      resolve(u.searchParams.get('code'));
    });
    server.listen(8765, '127.0.0.1', () => {
      console.log('请在浏览器中完成 COROS 登录授权：\n' + authUrl.toString());
      execFile('open', [authUrl.toString()], () => {});
    });
  });

  const token = await postForm(meta.token_endpoint, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT,
    client_id: reg.client_id,
    code_verifier: verifier,
    resource: `${host}/mcp`,
  });
  saveState({ region, host, tokenEndpoint: meta.token_endpoint, clientId: reg.client_id, token, obtainedAt: Date.now() });
  console.log('登录成功，token 字段：', Object.keys(token).join(', '), '有效期(s)：', token.expires_in);
}

async function accessToken() {
  const s = loadState();
  if (!s) throw new Error('请先运行 login');
  if (Date.now() < s.obtainedAt + (s.token.expires_in - 60) * 1000) return s;
  if (!s.token.refresh_token) throw new Error('token 过期且无 refresh_token，请重新 login');
  s.token = { ...s.token, ...(await postForm(s.tokenEndpoint, { grant_type: 'refresh_token', refresh_token: s.token.refresh_token, client_id: s.clientId })) };
  s.obtainedAt = Date.now();
  saveState(s);
  return s;
}

async function rpc(s, sessionId, method, params, id) {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    authorization: `Bearer ${s.token.access_token}`,
    'mcp-protocol-version': '2025-06-18',
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;
  const body = { jsonrpc: '2.0', method, ...(params ? { params } : {}), ...(id != null ? { id } : {}) };
  const res = await fetch(`${s.host}/mcp`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${res.status} ${text}`);
  const sid = res.headers.get('mcp-session-id') || sessionId;
  if (id == null) return { sid };
  const payload = res.headers.get('content-type')?.includes('event-stream')
    ? text.split('\n').filter((l) => l.startsWith('data:')).map((l) => JSON.parse(l.slice(5))).find((m) => m.id === id)
    : JSON.parse(text);
  if (payload.error) throw new Error(JSON.stringify(payload.error));
  return { sid, result: payload.result };
}

async function session() {
  const s = await accessToken();
  const init = await rpc(s, null, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'nowornever-probe', version: '0.1' } }, 1);
  await rpc(s, init.sid, 'notifications/initialized');
  return { s, sid: init.sid, serverInfo: init.result };
}

const [cmd, ...args] = process.argv.slice(2);
fs.mkdirSync(OUT_DIR, { recursive: true });
async function loginCli(region = 'cn') {
  const host = HOSTS[region];
  const meta = await (await fetch(`${host}/.well-known/oauth-authorization-server`)).json();
  const reg = await (
    await fetch(meta.registration_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'NowORNever probe',
        redirect_uris: [REDIRECT],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: SCOPE,
      }),
    })
  ).json();
  if (!reg.client_id) throw new Error('注册失败 ' + JSON.stringify(reg));

  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));
  const codePromise = new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, REDIRECT);
      if (u.pathname !== '/callback') return res.end();
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<h2>授权完成，可以关闭此页面。</h2>');
      server.close();
      if (u.searchParams.get('state') !== state) return reject(new Error('state 不匹配'));
      if (u.searchParams.get('error')) return reject(new Error(u.searchParams.get('error_description') || u.searchParams.get('error')));
      resolve(u.searchParams.get('code'));
    });
    server.listen(8765, '127.0.0.1');
  });

  const sessionRes = await fetch(`${host}/api/v1/cli/login-sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId: reg.client_id }),
  });
  const sessionJson = await sessionRes.json().catch(() => ({}));
  if (!sessionRes.ok || !sessionJson.loginUrl) {
    throw new Error(`登录会话创建失败 ${sessionRes.status} ${JSON.stringify(sessionJson).slice(0, 300)}`);
  }
  console.log('请在打开的浏览器里登录高驰并允许授权。\n' + sessionJson.loginUrl);
  execFile('open', [sessionJson.loginUrl], () => {});

  const deadline = Date.now() + 180_000;
  let ticket = '';
  while (Date.now() < deadline) {
    const claim = await fetch(`${host}/api/v1/cli/login-sessions/${sessionJson.sessionId}/claim`, {
      method: 'POST',
      headers: { 'X-Poll-Token': sessionJson.pollToken },
    });
    const body = await claim.json();
    const status = String(body.status || '').toLowerCase();
    console.log('登录状态：', status || claim.status);
    if (status === 'authorized') {
      ticket = body.loginTicket;
      break;
    }
    if (status && status !== 'pending') throw new Error('登录失败 ' + JSON.stringify(body).slice(0, 300));
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!ticket) throw new Error('登录超时');

  const auth = new URL(`${host}/oauth2/authorize`);
  Object.entries({
    response_type: 'code',
    client_id: reg.client_id,
    redirect_uri: REDIRECT,
    scope: SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: `${host}/mcp`,
    login_ticket: ticket,
  }).forEach(([k, v]) => auth.searchParams.set(k, v));
  await fetch(auth).catch(() => undefined);
  const code = await codePromise;
  const token = await postForm(meta.token_endpoint, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT,
    client_id: reg.client_id,
    code_verifier: verifier,
  });
  saveState({ region, host, tokenEndpoint: meta.token_endpoint, clientId: reg.client_id, token, obtainedAt: Date.now() });
  console.log('登录成功，token 字段：', Object.keys(token).join(', '), '有效期(s)：', token.expires_in);
}

if (cmd === 'login') await login(args[0]);
else if (cmd === 'login-cli') await loginCli(args[0]);
else if (cmd === 'list') {
  const { s, sid, serverInfo } = await session();
  const { result } = await rpc(s, sid, 'tools/list', {}, 2);
  fs.writeFileSync(path.join(OUT_DIR, 'server-info.json'), JSON.stringify(serverInfo, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'tools.json'), JSON.stringify(result, null, 2));
  for (const t of result.tools) console.log(`- ${t.name}: ${(t.description || '').split('\n')[0]}`);
} else if (cmd === 'call') {
  const { s, sid } = await session();
  const { result } = await rpc(s, sid, 'tools/call', { name: args[0], arguments: JSON.parse(args[1] || '{}') }, 3);
  const out = path.join(OUT_DIR, `sample-${args[0]}.json`);
  fs.writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2).slice(0, 4000));
} else console.log('用法：login [cn|us] | list | call <tool> <json>');
