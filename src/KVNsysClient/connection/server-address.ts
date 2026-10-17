import { DefaultPort } from '@kvnsys/wire';

/**
 * Turns what a person types into a server address. "192.168.0.111", "192.168.0.111:9000" and
 * "http://192.168.0.111:9000" all mean the same server, and come back as
 * "http://192.168.0.111:9000". Returns null when the text can't be a server address.
 */
export function normalizeServerAddress(typed: string): string | null {
  const text = typed.trim();
  if (text === '' || /\s/.test(text)) return null;

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  // A server address is a machine and a port, nothing more.
  if (!url.hostname || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;

  // URL hides a port that equals the scheme's own default (80 for http), so check whether one
  // was typed before falling back to KVNsys's port.
  const host = withScheme.slice(withScheme.indexOf('//') + 2).split('/')[0] ?? '';
  const typedPort = /:\d+$/.test(host);
  const port = url.port || (typedPort ? (url.protocol === 'https:' ? '443' : '80') : String(DefaultPort));
  return `${url.protocol}//${url.hostname}:${port}`;
}
