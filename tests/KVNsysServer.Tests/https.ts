import { request } from 'node:https';

/**
 * An HTTPS request that trusts only the given certificate, the way a register that has pinned
 * the server does. Resolves with the status and the parsed body.
 */
export function httpsJson(
  url: string,
  options: { ca: string; method?: 'GET' | 'POST'; body?: unknown },
): Promise<{ status: number; body: unknown; text: string }> {
  const payload = options.body === undefined ? undefined : JSON.stringify(options.body);
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: options.method ?? 'GET',
      ca: options.ca,
      agent: false,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
    });
    req.on('error', reject);
    req.on('response', (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          body = undefined;
        }
        resolve({ status: res.statusCode ?? 0, body, text });
      });
    });
    req.end(payload);
  });
}
