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

test('verifies a checkmate win with matching positions and final decisions', () => {
  assert.deepEqual(auditMatch(fixture()), { result: '1-0', won: true, verifiedMoves: true, plies: 7, decisions: 4, strategies: ['compact-review'] });
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
