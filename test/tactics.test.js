import test from 'node:test';
import assert from 'node:assert/strict';
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
