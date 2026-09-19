import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { candidates, fromHistory } from '../src/chess.js';
import { tacticalConsequences } from '../src/tactics.js';

function facts(history, notation) {
  const chess = fromHistory(history);
  const fen = chess.fen();
  const result = tacticalConsequences(chess, candidates(chess).find(move => move.notation === notation));
  assert.equal(chess.fen(), fen);
  assert.deepEqual(chess.history(), history);
  return result;
}

test('the losing bishop check in the original game exposes its recapture and material loss', () => {
  const result = facts(['e4', 'e6', 'Nf3', 'd5', 'exd5', 'exd5', 'Bb5+', 'c6'], 'Bxc6+');
  const reply = result.forcingReplies.find(reply => reply.reply === 'Nxc6');
  assert.equal(reply.capturesMovedPiece, true);
  assert.equal(reply.netMaterialChangeAfterExchange, -2);
  assert.deepEqual(reply.exchangeLine, ['Bxc6+', 'Nxc6']);
});

test('normal recapture sequences are distinguished from hanging a piece', () => {
  const result = facts(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'], 'Bxc6');
  const reply = result.forcingReplies.find(reply => reply.reply === 'dxc6');
  assert.equal(reply.netMaterialChangeAfterExchange, 0);
});

test('the original rook sacrifice has a negative exchange despite giving check', () => {
  const result = facts(['e4', 'e6', 'Nf3', 'd5', 'exd5', 'exd5', 'Bb5+', 'c6', 'Bxc6+', 'Nxc6', 'O-O', 'Nf6', 'Nc3', 'd4', 'Nxd4', 'Nxd4', 'Re1+', 'Be7'], 'Rxe7+');
  assert.equal(result.forcingReplies.find(reply => reply.reply === 'Qxe7').netMaterialChangeAfterExchange, -2);
});

test('mate-in-one replies are explicitly identified', () => {
  const result = facts(['f3', 'e5'], 'g4');
  assert.equal(result.opponentCanCheckmateImmediately, true);
  assert.equal(result.forcingReplies.find(reply => reply.reply === 'Qh4#').opponentCheckmates, true);
});

test('a dangerous choice is reviewed once with every legal move still available', async () => {
  const { chooseMove } = await import('../src/jev.js');
  const history = ['e4', 'e6', 'Nf3', 'd5', 'exd5', 'exd5', 'Bb5+', 'c6'];
  const requests = [];
  const result = await chooseMove(history, { apiKey: 'test', fetchImpl: async (url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ answers: { move: { choice: 'b5c6', confidence: 0.5 } }, usage: { input_tokens: 10, output_tokens: 2 }, model: 'test' }) };
  } });
  assert.equal(requests.length, 2);
  assert.deepEqual(Object.keys(requests[0].questions.move.criteria), Object.keys(requests[1].questions.move.criteria));
  assert.equal(result.move.uci, 'b5c6');
  assert.equal(result.decisionRounds.length, 2);
  assert.equal(result.usage.input_tokens, 20);
});

test('the crowded position that exceeded the API limit stays within the request budget', async () => {
  const { makeRequest } = await import('../src/jev.js');
  const history = ['e4', 'd5', 'exd5', 'Nf6', 'Bb5+', 'Bd7', 'Bxd7+', 'Qxd7', 'c4', 'c6', 'dxc6', 'Nxc6', 'Nf3', 'e5', 'O-O', 'e4', 'Qe2', 'O-O-O', 'Ng5', 'Nd4', 'Qe3', 'Ng4', 'Qxe4', 'f5', 'Qf4', 'Ne2+', 'Kh1', 'Nxf4', 'Nc3', 'Qd3', 'Re1', 'Nxf2+', 'Kg1', 'Bc5'];
  const { request, moves } = makeRequest(history);
  assert.ok(JSON.stringify(request).length <= 32000);
  assert.equal(Object.keys(request.questions.move.criteria).length, moves.length);
  assert.equal(moves.length, fromHistory(history).moves().length);
});

test('extended checking lines expose the rook lost after a knight fork', () => {
  const history = ['e4', 'd6', 'Nf3', 'Nc6', 'Nc3', 'Bg4', 'd4', 'e5', 'dxe5', 'dxe5', 'Qxd8+', 'Rxd8', 'Nd5', 'Bxf3', 'gxf3', 'Nd4', 'Nxc7+', 'Kd7'];
  const chess = fromHistory(history);
  const before = chess.fen();
  const candidate = candidates(chess).find(move => move.notation === 'Nd5');
  const simple = tacticalConsequences(chess, candidate);
  const extended = tacticalConsequences(chess, candidate, { extendChecks: true });
  assert.equal(simple.forcingReplies.find(reply => reply.reply === 'Nxc2+').netMaterialChangeAfterExchange, -1);
  const fork = extended.forcingReplies.find(reply => reply.reply === 'Nxc2+');
  assert.equal(fork.netMaterialChangeAfterExchange, -6);
  assert.equal(fork.extendedCheckLine, true);
  const replay = fromHistory(history);
  for (const san of fork.exchangeLine) replay.move(san);
  assert.equal(chess.fen(), before);
  assert.deepEqual(chess.history(), history);
});

test('quiet pawn threats reveal a forced piece loss before the capture arrives', () => {
  const history = ['e4', 'c5', 'e5', 'd5', 'd4', 'Nc6', 'dxc5', 'e6', 'Nc3', 'Bxc5', 'Nf3', 'Nge7', 'Bd2', 'Qb6', 'Bb5', 'Bxf2+', 'Ke2', 'O-O', 'Bxc6', 'bxc6', 'Qc1', 'Nf5', 'Rb1', 'Rb8', 'Na4', 'Ba6+', 'Kd1', 'Qb5', 'Nc3', 'Qb6', 'Na4', 'Qb5', 'Nc3', 'Qc4'];
  const chess = fromHistory(history);
  const original = chess.fen();
  const candidate = candidates(chess).find(move => move.notation === 'Bf4');
  const basic = tacticalConsequences(chess, candidate, { extendChecks: true });
  const extended = tacticalConsequences(chess, candidate, { extendChecks: true, extendThreats: true });
  assert.equal(basic.worstMaterialChangeInListedExchanges, 0);
  assert.equal(extended.worstMaterialChangeInListedExchanges, -2);
  const threat = extended.forcingReplies.find(reply => reply.reply === 'd4');
  assert.equal(threat.extendedQuietThreat, true);
  assert.equal(threat.netMaterialChangeAfterExchange, -2);
  const replay = fromHistory(history);
  for (const san of threat.exchangeLine) replay.move(san);
  assert.equal(chess.fen(), original);
  assert.deepEqual(chess.history(), history);
});

test('quiet fork analysis distinguishes a lost knight from a forcing rook escape', () => {
  for (const [pieces, expected] of [['N1N5', -2], ['R1R5', 0]]) {
    const chess = new Chess(`7k/8/1p6/8/${pieces}/8/8/7K w - - 0 1`);
    const original = chess.fen();
    const candidate = candidates(chess).find(move => move.notation === 'Kh2');
    const facts = tacticalConsequences(chess, candidate, { extendChecks: true, extendThreats: true });
    assert.equal(facts.worstMaterialChangeInListedExchanges, expected);
    assert.equal(facts.forcingReplies.find(reply => reply.reply === 'b5').extendedQuietThreat, true);
    assert.equal(chess.fen(), original);
  }
});
