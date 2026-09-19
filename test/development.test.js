import test from 'node:test';
import assert from 'node:assert/strict';
import {fromHistory, candidates} from '../src/chess.js';
import {developmentFacts} from '../src/development.js';

test('distinguishes repeated piece moves from fresh development and central pawn play', () => {
  const history = ['Nf3', 'd5', 'Nc3', 'Nf6'];
  const moves = candidates(fromHistory(history));
  const facts = developmentFacts(history, moves);
  assert.match(facts.f3d4, /REPEATED PIECE MOVE/);
  assert.match(facts.d2d4, /CENTER/);
  assert.equal(Object.keys(facts).length, moves.length);
});

test('marks a bishop blocking the initial central pawn advance', () => {
  const history = ['e4', 'e5'];
  const facts = developmentFacts(history, candidates(fromHistory(history)));
  assert.match(facts.f1d3, /blocks the initial advance/);
  assert.match(facts.f1c4, /previously undeveloped/);
});
