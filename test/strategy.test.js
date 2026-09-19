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
