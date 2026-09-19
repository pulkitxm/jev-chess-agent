import { Chess } from 'chess.js';
import { gameResult } from './chess.js';

function auditEngineAdvice(chess, advice) {
  const legal = chess.moves({ verbose: true }).map(move => `${move.from}${move.to}${move.promotion || ''}`);
  if (typeof advice.engine !== 'string' || !advice.engine.trim() || !Number.isInteger(advice.depth) || advice.depth < 1) throw new Error('Invalid engine identity or search depth');
  if (!Array.isArray(advice.lines) || advice.lines.length !== legal.length || new Set(advice.lines.map(line => line.move)).size !== legal.length) throw new Error('Engine advice does not cover every legal move exactly once');
  const lines = [...advice.lines].sort((a, b) => a.rank - b.rank);
  for (const [index, line] of lines.entries()) {
    if (line.rank !== index + 1 || line.depth !== advice.depth || !legal.includes(line.move)) throw new Error('Invalid engine ranking, move, or iteration depth');
    if (!['cp', 'mate'].includes(line.score?.type) || !Number.isInteger(line.score.value)) throw new Error('Invalid engine evaluation');
    if (!Array.isArray(line.variation) || line.variation[0] !== line.move || !Array.isArray(line.san) || !line.san.length || line.san.length !== Math.min(8, line.variation.length)) throw new Error('Invalid engine continuation');
    const replay = new Chess(chess.fen());
    for (let ply = 0; ply < line.san.length; ply++) {
      const uci = line.variation[ply];
      if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) throw new Error('Invalid engine continuation move');
      const move = replay.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (move.san !== line.san[ply]) throw new Error('Engine continuation notation does not match its moves');
    }
  }
  return lines[0].move;
}

export function auditMatch({ pgn, decisions, summary }) {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const history = chess.history();
  const replay = new Chess();
  const engines = new Set();
  const depths = [];
  let choicesFollowingFirstRecommendation = 0;
  let reviewedChoices = 0;
  let index = 0;
  for (const san of history) {
    if (replay.turn() === 'w') {
      const decision = decisions[index++];
      if (!decision || decision.fen !== replay.fen() || JSON.stringify(decision.history) !== JSON.stringify(replay.history())) throw new Error('Decision position does not match the recorded game');
      if (decision.strategy === 'engine-review' && !decision.engineAdvice?.lines?.length) throw new Error('Missing engine assistance record');
      const move = replay.moves({ verbose: true }).find(move => move.san === san);
      const uci = `${move.from}${move.to}${move.promotion || ''}`;
      if (decision.move?.uci !== uci || decision.move?.notation !== san || decision.decisionRounds?.at(-1)?.choice !== uci) throw new Error('Played move does not match the final Jev choice');
      if (decision.engineAdvice) {
        const recommended = auditEngineAdvice(replay, decision.engineAdvice);
        engines.add(decision.engineAdvice.engine);
        depths.push(decision.engineAdvice.depth);
        choicesFollowingFirstRecommendation += Number(recommended === uci);
        reviewedChoices += Number(decision.decisionRounds.length > 1);
      }
    }
    replay.move(san);
  }
  if (index !== decisions.length) throw new Error('Decision count does not match the recorded game');
  const result = gameResult(chess);
  if (!summary.complete || !chess.isGameOver() || summary.result !== result || chess.getHeaders().Result !== result) throw new Error('Incomplete or inconsistent game result');
  const engineAssisted = decisions.some(decision => Boolean(decision.engineAdvice));
  if (summary.engineAssisted !== undefined && summary.engineAssisted !== engineAssisted) throw new Error('Engine assistance label does not match the decision records');
  return { result, won: result === '1-0' && chess.isCheckmate() && chess.turn() === 'b', verifiedMoves: true, engineAssisted, plies: history.length, decisions: index, strategies: [...new Set(decisions.map(decision => decision.strategy))], ...(engineAssisted ? { engineAudit: { engines: [...engines], decisions: depths.length, allLegalMovesCovered: true, displayedContinuationsLegal: true, choicesFollowingFirstRecommendation, reviewedChoices, minimumCompleteDepth: Math.min(...depths), maximumCompleteDepth: Math.max(...depths) } } : {}) };
}
