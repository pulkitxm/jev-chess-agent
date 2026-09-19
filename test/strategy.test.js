import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRequest, chooseMove } from '../src/jev.js';
import { semanticRequest } from '../src/strategy.js';

test('plain-language strategy keeps every legal choice and the final model answer', async () => {
  const history = ['e4', 'e6', 'Nf3', 'd5', 'exd5', 'exd5', 'Bb5+', 'c6'];
  const { request, moves } = makeRequest(history);
  const semantic = semanticRequest(request, moves);
  assert.deepEqual(Object.keys(semantic.questions.move.criteria), moves.map(move => move.uci));
  assert.match(semantic.questions.move.criteria.b5c6, /DANGER/);
  const result = await chooseMove(history, { apiKey: 'test', strategy: 'semantic', fetchImpl: async () => ({ ok: true, json: async () => ({ answers: { move: { choice: 'b5c6', confidence: 0.5 } } }) }) });
  assert.equal(result.move.uci, 'b5c6');
  assert.equal(result.strategy, 'semantic');
});

test('reviews an uncompensated queen sacrifice even when every alternative has a material warning', async () => {
  const history = ['e4', 'c5', 'Nf3', 'd6', 'Nc3', 'Nf6', 'Bb5+', 'Bd7', 'Bxd7+', 'Nbxd7', 'O-O', 'e5', 'Ng5', 'Be7', 'Nf3', 'b5', 'Nxb5', 'Nxe4', 'Nc3', 'Nxc3', 'bxc3', 'e4', 'Ne1', 'd5', 'd4', 'O-O', 'dxc5', 'Nxc5', 'Qd4', 'Ne6', 'Qe5', 'Bf6', 'Qg3', 'Rc8', 'Bb2', 'Qb6', 'Rb1', 'Bxc3'];
  const requests = [];
  const result = await chooseMove(history, { apiKey: 'test', fetchImpl: async (url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ answers: { move: { choice: 'g3c3', confidence: 0.5 } } }) };
  } });
  assert.equal(requests.length, 2);
  assert.match(requests[1].state.warning, /No alternative is certified/);
  assert.match(requests[1].state.proposedConsequences.queenWarning, /queen can be captured/);
  assert.equal(result.move.uci, 'g3c3');
});

test('separate perspectives inform a final Jev choice without narrowing legal moves', async () => {
  const requests = [];
  const result = await chooseMove([], { apiKey: 'test', strategy: 'deliberate', fetchImpl: async (url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ answers: requests.length === 1 ? {
      move: { choice: 'e2e4', confidence: 0.5 }, defense: { choice: 'd2d4' }, coordination: { choice: 'g1f3' }
    } : { move: { choice: 'f2f3', confidence: 0.4 } } }) };
  } });
  assert.equal(requests.length, 2);
  assert.equal(Object.keys(requests[0].questions).length, 3);
  assert.deepEqual(requests[1].state.perspectives, { defense: 'd2d4', coordination: 'g1f3' });
  assert.equal(Object.keys(requests[1].questions.move.criteria).length, 20);
  assert.equal(result.move.uci, 'f2f3');
});
