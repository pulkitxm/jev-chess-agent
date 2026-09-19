import test from 'node:test';
import assert from 'node:assert/strict';
import { fromHistory, placement, candidates } from '../src/chess.js';

async function harness({ url = 'https://www.chess.com/play/computer/Komodo25', pending = false } = {}) {
  const board = fromHistory([]);
  const session = {};
  const clicks = [];
  let listener, detached, selected, calls = 0, resolveDecision;
  const originalFetch = globalThis.fetch;
  globalThis.chrome = {
    storage: {
      local: { get: async () => ({ pairing: 'test-pairing' }) },
      session: { get: async key => ({ [key]: session[key] }), set: async values => Object.assign(session, structuredClone(values)) }
    },
    tabs: {
      get: async () => ({ id: 1, url }),
      sendMessage: async (id, message) => {
        if (message.type === 'snapshot') return { ok: true, board: { placement: placement(board), active: true } };
        if (message.type === 'point') {
          assert.equal(message.expected, placement(board));
          return { ok: true, point: { x: message.square.charCodeAt(0) - 96, y: Number(message.square[1]) } };
        }
      }
    },
    debugger: {
      attach: async () => {},
      detach: async () => detached?.({ tabId: 1 }),
      onDetach: { addListener: callback => { detached = callback; } },
      sendCommand: async (target, method, params) => {
        if (params.type !== 'mouseReleased') return;
        const square = String.fromCharCode(96 + params.x) + params.y;
        clicks.push(square);
        if (!selected) selected = square;
        else { board.move({ from: selected, to: square }); selected = null; board.move('e5'); }
      }
    },
    runtime: { onMessage: { addListener: callback => { listener = callback; } } }
  };
  globalThis.fetch = async (url, options) => {
    const payload = JSON.parse(options.body);
    if (url.endsWith('/game')) return Response.json({ ok: true });
    calls++;
    const move = candidates(fromHistory(payload.history)).find(move => move.uci === 'e2e4');
    const result = { fen: payload.fen, move, confidence: 0.7, elapsedMs: 1, model: 'test-model' };
    if (pending) await new Promise(resolve => { resolveDecision = resolve; });
    return Response.json(result);
  };
  await import(`../extension/background.js?test=${Math.random()}`);
  return {
    board, session, clicks,
    calls: () => calls,
    setUrl: value => { url = value; },
    resolve: () => resolveDecision?.(),
    send: message => listener(message, {}, () => {}),
    restore: () => { globalThis.fetch = originalFetch; delete globalThis.chrome; }
  };
}

async function until(predicate) {
  const deadline = Date.now() + 4000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Agent did not reach expected state');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

test('plays the chosen move, records a fast bot reply, then stops in single-move mode', async () => {
  const h = await harness();
  try {
    h.send({ type: 'start', tabId: 1, color: 'w', once: true });
    h.send({ type: 'start', tabId: 1, color: 'w', once: true });
    await until(() => h.session.state?.status === 'Move played. Ready for the next turn.');
    assert.deepEqual(h.clicks, ['e2', 'e4']);
    assert.deepEqual(h.session.savedGame.history, ['e4', 'e5']);
    assert.equal(h.calls(), 1);
    assert.equal(h.session.state.running, false);
  } finally { h.restore(); }
});

test('pause while waiting for Jev prevents a late response from clicking', async () => {
  const h = await harness({ pending: true });
  try {
    h.send({ type: 'start', tabId: 1, color: 'w' });
    await until(() => h.calls() === 1);
    h.send({ type: 'stop' });
    await until(() => h.session.state?.status === 'Paused');
    h.resolve();
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.deepEqual(h.clicks, []);
  } finally { h.restore(); }
});

test('refuses human games before requesting a move or attaching controls', async () => {
  const h = await harness({ url: 'https://www.chess.com/play/online' });
  try {
    h.send({ type: 'start', tabId: 1, color: 'w' });
    await until(() => h.session.state?.status === 'Open chess.com Play Bots first');
    assert.equal(h.calls(), 0);
    assert.deepEqual(h.clicks, []);
  } finally { h.restore(); }
});

test('navigation away while Jev is deciding blocks the returned move', async () => {
  const h = await harness({ pending: true });
  try {
    h.send({ type: 'start', tabId: 1, color: 'w' });
    await until(() => h.calls() === 1);
    h.setUrl('https://www.chess.com/play/online');
    h.resolve();
    await until(() => h.session.state?.status === 'Navigation left the bot game. Agent stopped.');
    assert.deepEqual(h.clicks, []);
  } finally { h.restore(); }
});
