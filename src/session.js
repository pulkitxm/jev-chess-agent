import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

export function chessCookies(state) {
  const cookies = Array.isArray(state) ? state : state?.cookies;
  if (!Array.isArray(cookies)) throw new Error('Session file must contain a cookies array');
  return cookies.map(cookie => {
    const domain = cookie.domain?.replace(/^\./, '');
    if (typeof domain !== 'string' || !(domain === 'chess.com' || domain.endsWith('.chess.com'))) throw new Error('Session file contains a cookie outside chess.com');
    if (typeof cookie.name !== 'string' || !cookie.name || typeof cookie.value !== 'string') throw new Error('Invalid cookie name or value');
    if (typeof cookie.path !== 'string' || !cookie.path.startsWith('/')) throw new Error('Invalid cookie path');
    if (!Number.isFinite(cookie.expires) || cookie.expires < -1) throw new Error('Invalid cookie expiration');
    if (!['Strict', 'Lax', 'None'].includes(cookie.sameSite)) throw new Error('Invalid cookie SameSite setting');
    if (typeof cookie.secure !== 'boolean' || typeof cookie.httpOnly !== 'boolean') throw new Error('Invalid cookie flags');
    return { name: cookie.name, value: cookie.value, domain: cookie.domain, path: cookie.path, expires: cookie.expires, httpOnly: cookie.httpOnly, secure: cookie.secure, sameSite: cookie.sameSite };
  }).filter(cookie => cookie.expires === -1 || cookie.expires > Date.now() / 1000);
}

export async function loadSession(context, configuredPath = process.env.CHESS_SESSION_FILE) {
  const path = resolve(configuredPath || 'data/auth/chess-session.json');
  let metadata;
  try { metadata = await stat(path); }
  catch (error) {
    if (error.code === 'ENOENT' && !configuredPath) return 0;
    throw new Error('Saved chess session is unavailable');
  }
  if (!metadata.isFile() || (metadata.mode & 0o077) !== 0) throw new Error('Chess session must be a private file with permissions 600');
  let state;
  try { state = JSON.parse(await readFile(path, 'utf8')); }
  catch { throw new Error('Unable to parse saved chess session'); }
  const cookies = chessCookies(state);
  if (!cookies.length) throw new Error('Saved chess session has no unexpired cookies');
  try { await context.addCookies(cookies); }
  catch { throw new Error('Chrome rejected the saved chess session'); }
  return cookies.length;
}
