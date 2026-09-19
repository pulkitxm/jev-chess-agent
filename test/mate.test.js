import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { fromHistory } from '../src/chess.js';
import { checkingMateProof } from '../src/mate.js';
import { makeRequest, chooseMove } from '../src/jev.js';
import { compactRequest } from '../src/compact.js';

const history = 'e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7'.split(' ');

test('queen sacrifice proof covers every defense and restores the complete position', () => {
  const chess = fromHistory(history);
  chess.move('Qb8+');
  const before = chess.fen();
  const proof = checkingMateProof(chess);
  assert.deepEqual(proof, { plies: 3, defenses: [{ reply: 'Nxb8', mate: 'Rd8#' }] });
  assert.deepEqual(proof.defenses.map(line => line.reply).sort(), chess.moves().sort());
  for (const line of proof.defenses) {
    chess.move(line.reply);
    chess.move(line.mate);
    assert.equal(chess.isCheckmate(), true);
    chess.undo();
    chess.undo();
  }
  assert.equal(chess.fen(), before);
  assert.deepEqual(chess.history(), [...history, 'Qb8+']);
});

test('one cooperative mating line is not a proof against every defense', () => {
  const chess = fromHistory(history);
  chess.move('Qxe6+');
  chess.move('Be7');
  assert.ok(chess.moves().includes('Qxe7#'));
  chess.undo();
  const before = chess.fen();
  assert.equal(checkingMateProof(chess), null);
  assert.equal(chess.fen(), before);
  assert.deepEqual(chess.history(), [...history, 'Qxe6+']);
});

test('a terminal draw is not searched past to claim a forced win', () => {
  const chess = fromHistory(history);
  chess.move('Qb8+');
  const fen = chess.fen().split(' ');
  fen[4] = '100';
  const drawn = new Chess(fen.join(' '));
  assert.equal(drawn.isDraw(), true);
  assert.equal(checkingMateProof(drawn), null);
});

test('compact advice prioritizes a proven queen sacrifice without filtering legal moves', async () => {
  const { request, moves } = makeRequest(history, undefined, { extendChecks: true, extendThreats: true });
  const compact = compactRequest(request, moves);
  assert.equal(moves.find(move => move.uci === 'b3b8').tactics.worstMaterialChangeInListedExchanges, -9);
  assert.match(compact.questions.move.criteria.b3b8, /PREFERRED TACTICAL GROUP.*PROVEN CHECKMATE IN TWO/);
  assert.doesNotMatch(compact.questions.move.criteria.b3b8, /Refutation/);
  assert.match(compact.state.tacticalComparison.explanation, /every legal defense/);
  assert.deepEqual(Object.keys(compact.questions.move.criteria), moves.map(move => move.uci));
  const requests = [];
  const result = await chooseMove(history, { apiKey: 'test', strategy: 'compact-review', fetchImpl: async (url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ answers: { move: { choice: 'b3b8', confidence: 0.9 } } }) };
  } });
  assert.equal(result.move.uci, 'b3b8');
  assert.equal(requests.length, 2);
  assert.doesNotMatch(requests[1].state.reviewWarning, /permits a concrete material loss/);
  assert.match(requests[1].questions.move.criteria.b3b8, /PROVEN CHECKMATE IN TWO/);
});
