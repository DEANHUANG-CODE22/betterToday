import TcpSocket from 'react-native-tcp-socket';

export interface Loopback {
  redirectUri: string;
  waitForCallback: () => Promise<{ code: string; state: string }>;
  close: () => void;
}

const HTML = '<!doctype html><meta charset="utf-8"><title>betterToday</title><p>授权完成，请回到 betterToday。</p>';

/** 在手机本机接收 COROS 的授权回调。高驰只接受 https 或 127.0.0.1。 */
export function startLoopback(expectedState: string, timeoutMs = 180_000): Promise<Loopback> {
  return new Promise((resolve, reject) => {
    const attempt = (port: number) => {
      if (port > 43140) {
        reject(new Error('本机授权端口被占用'));
        return;
      }
      let done = false;
      let succeed: (v: { code: string; state: string }) => void = () => {};
      let fail: (e: Error) => void = () => {};
      const pending = new Promise<{ code: string; state: string }>((res, rej) => {
        succeed = res;
        fail = rej;
      });
      const timer = setTimeout(() => finish(new Error('登录超时，请重试')), timeoutMs);
      const finish = (error?: Error, value?: { code: string; state: string }) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (error) fail(error);
        else if (value) succeed(value);
      };

      const server = TcpSocket.createServer((socket) => {
        let buf = '';
        socket.on('data', (data: Buffer | string) => {
          buf += typeof data === 'string' ? data : data.toString('utf8');
          if (!buf.includes('\r\n\r\n')) return;
          const path = (buf.split('\r\n')[0] ?? '').split(' ')[1] ?? '/';
          socket.write(`HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\nContent-Length: ${HTML.length}\r\n\r\n${HTML}`);
          socket.destroy();
          let url: URL;
          try {
            url = new URL(path, 'http://127.0.0.1');
          } catch {
            return;
          }
          const code = url.searchParams.get('code');
          const state = url.searchParams.get('state');
          const error = url.searchParams.get('error_description') || url.searchParams.get('error');
          if (!code) finish(new Error(error || '授权回调缺少授权码'));
          else if (state !== expectedState) finish(new Error('授权校验失败（state 不匹配）'));
          else finish(undefined, { code, state });
        });
      });

      server.on('error', () => attempt(port + 1));
      server.listen({ port, host: '127.0.0.1', reuseAddress: true }, () => {
        resolve({
          redirectUri: `http://127.0.0.1:${port}/callback`,
          waitForCallback: () => pending,
          close: () => {
            clearTimeout(timer);
            server.close();
          },
        });
      });
    };
    attempt(43123);
  });
}
