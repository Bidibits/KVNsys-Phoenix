import { HelloPath, ServerHello } from '@kvnsys/wire';
import { describe, expect, it } from 'vitest';

describe('the hello call', () => {
  it('lives at /api/hello', () => {
    expect(HelloPath).toBe('/api/hello');
  });

  it("accepts a KVNsys server's answer", () => {
    expect(ServerHello.safeParse({ product: 'KVNsys Server', version: '0.1.0', protocol: 1 }).success).toBe(true);
  });

  it('turns down an answer from something that is not a KVNsys server', () => {
    expect(ServerHello.safeParse({ product: 'Some Other Server', version: '1.0', protocol: 1 }).success).toBe(false);
    expect(ServerHello.safeParse({ hello: 'world' }).success).toBe(false);
  });
});
