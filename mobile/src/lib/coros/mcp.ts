import { mcpUrl, validSession } from './oauth';

const PROTOCOL = '2025-06-18';

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

interface ToolResult {
  content?: { type: string; text?: string }[];
  structuredContent?: unknown;
  isError?: boolean;
}

/** 极简 MCP Streamable HTTP 客户端：只实现 initialize / tools/list / tools/call。 */
export class McpClient {
  private sessionId?: string;
  private nextId = 1;

  private async send(method: string, params?: unknown, notify = false): Promise<any> {
    const s = await validSession();
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${s.accessToken}`,
      'mcp-protocol-version': PROTOCOL,
    };
    if (this.sessionId) headers['mcp-session-id'] = this.sessionId;
    const id = notify ? undefined : this.nextId++;
    const res = await fetch(mcpUrl(s.region), {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', method, ...(params ? { params } : {}), ...(id != null ? { id } : {}) }),
    });
    const text = await res.text();
    if (res.status === 401) throw new Error('COROS 授权失效，请重新连接');
    if (!res.ok) throw new Error(`MCP ${method} 失败：${res.status} ${text.slice(0, 200)}`);
    this.sessionId = res.headers.get('mcp-session-id') ?? this.sessionId;
    if (id == null) return undefined;
    const msg = res.headers.get('content-type')?.includes('event-stream')
      ? text
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => JSON.parse(l.slice(5)))
          .find((m) => m.id === id)
      : JSON.parse(text);
    if (msg?.error) throw new Error(`MCP ${method} 错误：${msg.error.message}`);
    return msg?.result;
  }

  async connect() {
    if (this.sessionId) return;
    await this.send('initialize', { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'nowornever', version: '0.1.0' } });
    await this.send('notifications/initialized', undefined, true);
  }

  async listTools(): Promise<McpTool[]> {
    await this.connect();
    return (await this.send('tools/list', {})).tools;
  }

  /** 调用工具并返回解析后的 JSON（优先 structuredContent，其次 text 内容）。 */
  async call<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    await this.connect();
    const r: ToolResult = await this.send('tools/call', { name, arguments: args });
    const text = r.content?.find((c) => c.type === 'text')?.text;
    if (r.isError) throw new Error(`${name}：${text ?? '工具返回错误'}`);
    if (r.structuredContent != null) return r.structuredContent as T;
    try {
      return JSON.parse(text ?? 'null') as T;
    } catch {
      return text as T;
    }
  }
}
