import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { fromHistory } from '../src/chess.js';

test('local bridge protects pairing, rejects unpaired moves, and records a valid game', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chess-bridge-test-'));
  const port = 48000 + Math.floor(Math.random() * 10000);
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['src/server.js'], {
    env: { ...process.env, PORT: String(port), DATA_DIR: directory, MAX_CALLS: '0', TYPESAFE_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  try {
    await Promise.race([
      once(child.stdout, 'data'),
      once(child, 'exit').then(() => { throw new Error('Server exited before listening'); }),
      new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Startup timeout')), 5000); timer.unref(); })
    ]);
    assert.equal((await fetch(base)).status, 200);
    assert.equal((await fetch(`${base}/api/status`)).status, 200);
    assert.equal((await fetch(`${base}/api/pairing`, { headers: { Origin: 'https://unrelated.example' } })).status, 403);
    assert.equal((await fetch(`${base}/api/pairing`, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    assert.equal((await fetch(`${base}/api/pairing`, { headers: { Origin: `chrome-extension://${'a'.repeat(32)}` } })).status, 401);
    assert.equal((await fetch(`${base}/api/choose`, { method: 'POST', body: '{}' })).status, 401);
    const { token } = await (await fetch(`${base}/api/pairing`)).json();
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    assert.equal((await fetch(`${base}/api/choose`, { method: 'POST', headers, body: JSON.stringify({ history: [], fen: fromHistory([]).fen() }) })).status, 429);
    assert.equal((await fetch(`${base}/api/game`, { method: 'POST', headers, body: JSON.stringify({ id: '../escape', history: [] }) })).status, 400);
    assert.equal((await fetch(`${base}/api/game`, { method: 'POST', headers, body: JSON.stringify({ id: 'fixture', history: ['invalid'] }) })).status, 400);
    const response = await fetch(`${base}/api/game`, { method: 'POST', headers, body: JSON.stringify({ id: 'fixture', history: ['f3', 'e5', 'g4', 'Qh4#'] }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).result, '0-1');
    assert.match(await readFile(join(directory, 'fixture.pgn'), 'utf8'), /1\. f3 e5 2\. g4 Qh4# 0-1/);
  } finally {
    const exited = once(child, 'exit');
    child.kill();
    await exited;
    await rm(directory, { recursive: true, force: true });
  }
});
