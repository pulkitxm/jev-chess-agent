import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { auditMatch } from '../src/match-audit.js';

function fixture() {
  const chess = new Chess();
  const decisions = [];
  for (const san of ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#']) {
    const fen = chess.fen();
    const history = chess.history();
    const move = chess.move(san);
    if (move.color === 'w') {
      const uci = `${move.from}${move.to}${move.promotion || ''}`;
      decisions.push({ fen, history, move: { uci, notation: san }, decisionRounds: [{ choice: uci }], strategy: 'compact-review' });
    }
  }
  chess.header('Result', '1-0');
  return { pgn: chess.pgn(), decisions, summary: { complete: true, result: '1-0' } };
}

function assistedFixture() {
  const match = fixture();
  match.summary.engineAssisted = true;
  for (const decision of match.decisions) {
    decision.strategy = 'engine-review';
    const chess = new Chess(decision.fen);
    const moves = chess.moves({ verbose: true }).sort((a, b) => Number(b.san === decision.move.notation) - Number(a.san === decision.move.notation));
    decision.engineAdvice = { engine: 'Stockfish fixture', depth: 3, lines: moves.map((move, index) => {
      const uci = `${move.from}${move.to}${move.promotion || ''}`;
      return { move: uci, rank: index + 1, depth: 3, score: { type: 'cp', value: 30 - index }, variation: [uci], san: [move.san] };
    }) };
  }
  return match;
}

test('verifies a checkmate win with matching positions and final decisions', () => {
  assert.deepEqual(auditMatch(fixture()), { result: '1-0', won: true, verifiedMoves: true, engineAssisted: false, plies: 7, decisions: 4, strategies: ['compact-review'] });
});

test('rejects substituted moves, stale decisions, extra decisions, and false results', () => {
  for (const mutate of [
    match => { match.decisions[0].decisionRounds[0].choice = 'd2d4'; },
    match => { match.decisions[1].fen = match.decisions[0].fen; },
    match => { match.decisions[1].history = []; },
    match => { match.decisions.push(match.decisions[0]); },
    match => { match.summary.result = '0-1'; },
    match => { match.summary.complete = false; }
  ]) {
    const match = fixture();
    mutate(match);
    assert.throws(() => auditMatch(match));
  }
});

test('engine-assisted results cannot be mislabeled as engine-free', () => {
  const match = assistedFixture();
  assert.equal(auditMatch(match).engineAssisted, true);
  match.summary.engineAssisted = false;
  assert.throws(() => auditMatch(match), /assistance label/);
  match.summary.engineAssisted = true;
  delete match.decisions[0].engineAdvice;
  assert.throws(() => auditMatch(match), /Missing engine assistance/);
});

test('assisted audit verifies legal coverage and continuations and reports recommendation use', () => {
  const match = assistedFixture();
  const audit = auditMatch(match);
  assert.deepEqual(audit.engineAudit, { engines: ['Stockfish fixture'], decisions: 4, allLegalMovesCovered: true, displayedContinuationsLegal: true, choicesFollowingFirstRecommendation: 4, reviewedChoices: 0, minimumCompleteDepth: 3, maximumCompleteDepth: 3 });
  match.decisions[0].engineAdvice.lines[0].rank = 2;
  match.decisions[0].engineAdvice.lines[1].rank = 1;
  assert.equal(auditMatch(match).engineAudit.choicesFollowingFirstRecommendation, 3);
});

test('assisted audit rejects incomplete, duplicated, stale, and illegal advice', () => {
  for (const mutate of [
    advice => { advice.lines.pop(); },
    advice => { advice.lines[1] = advice.lines[0]; },
    advice => { advice.lines[0].depth++; },
    advice => { advice.lines[0].rank = 100; },
    advice => { advice.lines[0].score.value = NaN; },
    advice => { advice.lines[0].san[0] = 'd4'; },
    advice => { advice.lines[0].variation.push('e7e4'); advice.lines[0].san.push('e4'); },
    advice => { advice.engine = ''; }
  ]) {
    const match = assistedFixture();
    mutate(match.decisions[0].engineAdvice);
    assert.throws(() => auditMatch(match));
  }
});
