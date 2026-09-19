import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chessCookies, loadSession } from '../src/session.js';

const cookie = { name: 'session', value: 'synthetic-secret', domain: '.chess.com', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' };

test('session import accepts chess subdomains and rejects unrelated or lookalike domains', () => {
  assert.equal(chessCookies({ cookies: [cookie] }).length, 1);
  assert.equal(chessCookies([{ ...cookie, domain: 'www.chess.com' }]).length, 1);
  for (const domain of ['evilchess.com', '.chess.com.example.org', 'example.com']) assert.throws(() => chessCookies([{ ...cookie, domain }]), /outside chess.com/);
  assert.equal(chessCookies([{ ...cookie, expires: 1 }]).length, 0);
});

test('private session loads cookies without importing other storage', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chess-session-test-'));
  const file = join(directory, 'session.json');
  try {
    await writeFile(file, JSON.stringify({ cookies: [cookie], origins: [{ origin: 'https://example.com', localStorage: [] }] }), { mode: 0o600 });
    let imported;
    assert.equal(await loadSession({ addCookies: async cookies => { imported = cookies; } }, file), 1);
    assert.deepEqual(imported, [cookie]);
    await chmod(file, 0o644);
    await assert.rejects(loadSession({ addCookies: async () => {} }, file), /permissions 600/);
  } finally { await rm(directory, { recursive: true }); }
});

test('browser errors cannot expose cookie values in runner logs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'chess-session-test-'));
  const file = join(directory, 'session.json');
  try {
    await writeFile(file, JSON.stringify({ cookies: [cookie] }), { mode: 0o600 });
    await assert.rejects(loadSession({ addCookies: async () => { throw new Error(cookie.value); } }, file), error => error.message === 'Chrome rejected the saved chess session');
    await writeFile(file, '{synthetic-secret');
    await assert.rejects(loadSession({}, file), error => error.message === 'Unable to parse saved chess session');
  } finally { await rm(directory, { recursive: true }); }
});
