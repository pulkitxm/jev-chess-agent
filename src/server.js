import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, sep } from 'node:path';
import { chooseMove } from './jev.js';
import { fromHistory, gameResult } from './chess.js';

const root = new URL('../', import.meta.url);
const data = process.env.DATA_DIR ? pathToFileURL(resolve(process.env.DATA_DIR) + sep) : new URL('data/', root);
await mkdir(data, { recursive: true, mode: 0o700 });
const tokenFile = new URL('bridge-token', data);
let token;
try { token = (await readFile(tokenFile, 'utf8')).trim(); }
catch { token = randomBytes(24).toString('hex'); await writeFile(tokenFile, token, { mode: 0o600 }); }
const port = Number(process.env.PORT || 4318);
const sessions = new Map();
let busy = false;
let calls = 0;
let inputTokens = 0;
const maxCalls = Number(process.env.MAX_CALLS || 200);

function reply(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function body(req) {
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 100000) throw new Error('Request too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}

function authorized(req) {
  const value = Buffer.from(req.headers.authorization?.replace(/^Bearer /, '') || '');
  const expected = Buffer.from(token);
  return value.length === expected.length && timingSafeEqual(value, expected);
}

const server = http.createServer(async (req, res) => {
  try {
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) return reply(res, 403, { error: 'Local requests only' });
    const origin = req.headers.origin;
    const localOrigin = [`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(origin);
    const extensionOrigin = /^chrome-extension:\/\/[a-z]{32}$/.test(origin || '');
    if (origin && !localOrigin && !extensionOrigin) return reply(res, 403, { error: 'Origin not allowed' });
    if (req.headers['sec-fetch-site'] === 'cross-site' && !extensionOrigin) return reply(res, 403, { error: 'Cross-site request rejected' });
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const path = new URL(req.url, `http://127.0.0.1:${port}`).pathname;
    if (req.method === 'GET' && path === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'" });
      return res.end(await readFile(new URL('web/index.html', root)));
    }
    if (req.method === 'GET' && path === '/app.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' });
      return res.end(await readFile(new URL('web/app.js', root)));
    }
    if (req.method === 'GET' && path === '/api/status') return reply(res, 200, { configured: Boolean(process.env.TYPESAFE_API_KEY), model: process.env.TYPESAFE_MODEL || 'jev-1.13.0', calls, maxCalls, inputTokens, estimatedCost: inputTokens * 0.042 / 1000000, sessions: [...sessions.values()] });
    if (req.method === 'GET' && path === '/api/pairing' && !extensionOrigin) return reply(res, 200, { token });
    if (!authorized(req)) return reply(res, 401, { error: 'Pair the extension using the code shown on the local dashboard' });
    if (req.method === 'POST' && path === '/api/choose') {
      if (busy) return reply(res, 409, { error: 'A move decision is already running' });
      if (calls >= maxCalls) return reply(res, 429, { error: 'Session call limit reached. Restart the service to continue.' });
      const payload = await body(req);
      const chess = fromHistory(payload.history);
      if (chess.fen() !== payload.fen) return reply(res, 409, { error: 'Position and history disagree' });
      if (busy) return reply(res, 409, { error: 'A move decision is already running' });
      if (calls >= maxCalls) return reply(res, 429, { error: 'Session call limit reached' });
      busy = true;
      calls++;
      try {
        const result = await chooseMove(payload.history, { apiKey: process.env.TYPESAFE_API_KEY, model: process.env.TYPESAFE_MODEL || 'jev-1.13.0' });
        inputTokens += result.usage?.input_tokens || 0;
        await appendFile(new URL('decisions.jsonl', data), JSON.stringify({ at: new Date().toISOString(), history: payload.history, ...result }) + '\n', { mode: 0o600 });
        return reply(res, 200, result);
      } finally { busy = false; }
    }
    if (req.method === 'POST' && path === '/api/game') {
      const payload = await body(req);
      if (!/^[a-zA-Z0-9-]{1,80}$/.test(payload.id)) throw new Error('Invalid game ID');
      const chess = fromHistory(payload.history);
      const result = gameResult(chess);
      chess.header('Event', 'Bot game', 'Site', 'Chess.com', 'Result', result);
      const game = { id: payload.id, history: chess.history(), fen: chess.fen(), result, updatedAt: new Date().toISOString() };
      sessions.set(payload.id, game);
      await writeFile(new URL(`${payload.id}.pgn`, data), chess.pgn(), { mode: 0o600 });
      return reply(res, 200, game);
    }
    return reply(res, 404, { error: 'Not found' });
  } catch (error) { reply(res, 400, { error: error.message }); }
});

server.listen(port, '127.0.0.1', () => console.log(`Chess dashboard: http://127.0.0.1:${port}\nExtension folder: ${fileURLToPath(new URL('dist/extension/', root))}\nAPI key configured: ${Boolean(process.env.TYPESAFE_API_KEY)}`));
