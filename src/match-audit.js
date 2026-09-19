import { Chess } from 'chess.js';
import { gameResult } from './chess.js';

export function auditMatch({ pgn, decisions, summary }) {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const history = chess.history();
  const replay = new Chess();
  let index = 0;
  for (const san of history) {
    if (replay.turn() === 'w') {
      const decision = decisions[index++];
      if (!decision || decision.fen !== replay.fen() || JSON.stringify(decision.history) !== JSON.stringify(replay.history())) throw new Error('Decision position does not match the recorded game');
      if (decision.strategy === 'engine-review' && !decision.engineAdvice?.lines?.length) throw new Error('Missing engine assistance record');
      const move = replay.moves({ verbose: true }).find(move => move.san === san);
      const uci = `${move.from}${move.to}${move.promotion || ''}`;
      if (decision.move?.uci !== uci || decision.move?.notation !== san || decision.decisionRounds?.at(-1)?.choice !== uci) throw new Error('Played move does not match the final Jev choice');
    }
    replay.move(san);
  }
  if (index !== decisions.length) throw new Error('Decision count does not match the recorded game');
  const result = gameResult(chess);
  if (!summary.complete || !chess.isGameOver() || summary.result !== result || chess.getHeaders().Result !== result) throw new Error('Incomplete or inconsistent game result');
  return { result, won: result === '1-0' && chess.isCheckmate() && chess.turn() === 'b', verifiedMoves: true, engineAssisted: decisions.some(decision => Boolean(decision.engineAdvice)), plies: history.length, decisions: index, strategies: [...new Set(decisions.map(decision => decision.strategy))] };
}
