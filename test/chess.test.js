import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { candidates, fromHistory, placement, reconcile } from '../src/chess.js';
import { chooseMove, makeRequest } from '../src/jev.js';

test('all legal moves are available to Jev without engine ranking', () => {
  const { request, moves } = makeRequest([]);
  assert.equal(moves.length, 20);
  assert.equal(Object.keys(request.questions.move.criteria).length, 20);
  assert.equal(request.state.sideToMove, 'White');
});

test('reconciles an observed opponent move and preserves castling state', () => {
  const tracked = fromHistory(['e4']);
  const actual = fromHistory(['e4', 'e5']);
  assert.equal(reconcile(tracked, placement(actual)).san, 'e5');
  assert.equal(tracked.fen(), actual.fen());
  assert.equal(reconcile(tracked, placement(actual)), null);
});

test('rejects skipped moves instead of inventing a position', () => {
  assert.throws(() => reconcile(new Chess(), placement(fromHistory(['e4', 'e5']))));
});

test('handles castling, en passant, and underpromotion as legal transitions', () => {
  for (const [fen, move] of [
    ['r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'O-O'],
    ['4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2', 'exd6'],
    ['4k3/P7/8/8/8/8/8/4K3 w - - 0 1', 'a8=N']
  ]) {
    const actual = new Chess(fen);
    const tracked = new Chess(fen);
    actual.move(move);
    reconcile(tracked, placement(actual));
    assert.equal(tracked.fen(), actual.fen());
  }
});

test('candidate facts include forced mate without choosing it in code', () => {
  const chess = fromHistory(['f3', 'e5', 'g4']);
  const before = chess.fen();
  const moves = candidates(chess);
  assert.equal(moves.find(move => move.uci === 'd8h4').checkmate, true);
  assert.equal(chess.fen(), before);
  assert.ok(moves.length > 1);
});

test('model answer is the selected move, including a weak legal choice', async () => {
  const result = await chooseMove([], { apiKey: 'test', fetchImpl: async () => ({
    ok: true, json: async () => ({ answers: { move: { choice: 'f2f3', confidence: 0.4 } }, model: 'test' })
  }) });
  assert.equal(result.move.uci, 'f2f3');
});

test('rejects illegal model output and API failures', async () => {
  await assert.rejects(chooseMove([], { apiKey: 'test', fetchImpl: async () => ({
    ok: true, json: async () => ({ answers: { move: { choice: 'e2e5', confidence: 1 } } })
  }) }), /outside/);
  await assert.rejects(chooseMove([], { apiKey: 'test', fetchImpl: async () => ({ ok: false, status: 429 }) }), /429/);
});
