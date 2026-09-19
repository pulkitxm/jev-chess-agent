import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { candidates, fromHistory } from '../src/chess.js';
import { passedPawns, positionFacts } from '../src/position-facts.js';
import { developmentFacts } from '../src/development.js';

test('passed-pawn detection uses both neighboring files and each color direction', () => {
  const blocked = new Chess('7k/2p5/8/1P6/8/8/8/7K w - - 0 1');
  assert.deepEqual(passedPawns(blocked, 'w'), []);
  assert.deepEqual(passedPawns(blocked, 'b'), []);
  const passed = new Chess('7k/8/8/1P6/2p5/8/8/7K w - - 0 1');
  assert.deepEqual(passedPawns(passed, 'w').map(pawn => pawn.square), ['b5']);
  assert.deepEqual(passedPawns(passed, 'b').map(pawn => pawn.square), ['c4']);
});

test('ending facts identify king approach, abandoned blockades, and captured passers', () => {
  const chess = new Chess('7k/8/8/8/8/1p2K3/1R6/8 w - - 0 1');
  const before = chess.fen();
  const facts = positionFacts(chess, candidates(chess));
  assert.match(facts.state.material, /ahead by 4/);
  assert.match(facts.state.enemyPassedPawns[0], /b3, 2 ranks/);
  assert.match(facts.notes.e3d3, /closer to/);
  assert.match(facts.notes.e3f3, /farther from/);
  assert.match(facts.notes.b2b1, /removes our blockade/);
  assert.match(facts.notes.b2b3, /removes an enemy passed pawn/);
  assert.equal(chess.fen(), before);
  assert.deepEqual(chess.history(), []);
});

test('ordinary king moves warn when castling rights are lost', () => {
  const chess = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  const facts = positionFacts(chess, candidates(chess));
  assert.match(facts.notes.e1e2, /gives up castling/);
  assert.doesNotMatch(facts.notes.e1g1, /gives up castling/);
});

test('repeated pawn advances distinguish gaining space from developing a piece', () => {
  const chess = fromHistory(['e4', 'c5']);
  const facts = developmentFacts(chess.history(), candidates(chess));
  assert.match(facts.e4e5, /DEVELOPMENT DELAY/);
  assert.doesNotMatch(facts.g1f3, /DEVELOPMENT DELAY/);
});
