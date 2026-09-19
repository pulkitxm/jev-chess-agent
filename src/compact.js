import { developmentFacts } from './development.js';
import { fromHistory } from './chess.js';
import { positionFacts } from './position-facts.js';

export function compactRequest(request, moves) {
  const development = developmentFacts(request.state.moveHistory, moves);
  const position = positionFacts(fromHistory(request.state.moveHistory), moves);
  const mateRisk = move => move.tactics.opponentCanCheckmateImmediately || move.tactics.opponentCanForceMateAfterReply;
  const mating = moves.filter(move => move.checkmate);
  const surviving = moves.filter(move => !mateRisk(move));
  const pool = mating.length ? mating : surviving.length ? surviving : moves;
  const bestMaterial = Math.max(...pool.map(move => move.tactics.worstMaterialChangeInListedExchanges));
  const preferred = mating.length ? mating : pool.filter(move => move.tactics.worstMaterialChangeInListedExchanges === bestMaterial);
  const preferredIds = new Set(preferred.map(move => move.uci));
  const bestDevelopment = Math.max(...preferred.map(move => position.developmentPriority[move.uci]));
  const developing = bestDevelopment > 0 ? preferred.filter(move => position.developmentPriority[move.uci] === bestDevelopment) : [];
  const developingIds = new Set(developing.map(move => move.uci));
  const describe = move => {
    const tactics = move.tactics;
    const loss = tactics.worstMaterialChangeInListedExchanges;
    const outcome = move.checkmate ? 'CHECKMATE: win now' : tactics.opponentCanCheckmateImmediately || tactics.opponentCanForceMateAfterReply ? 'LOSE BY CHECKMATE' : move.draw ? 'DRAW now' : loss < 0 ? `LOSE ${-loss} material units` : loss > 0 ? `GAIN ${loss} material units` : 'No detected material loss';
    const threat = [...tactics.forcingReplies].sort((a, b) => Number(b.opponentCheckmates || b.forcesMateAfterReply) - Number(a.opponentCheckmates || a.forcesMateAfterReply) || a.netMaterialChangeAfterExchange - b.netMaterialChangeAfterExchange)[0];
    const comparison = preferredIds.has(move.uci) ? 'PREFERRED TACTICAL GROUP.' : mating.length ? 'MISSES AVAILABLE CHECKMATE.' : mateRisk(move) && surviving.length ? 'AVOID: allows forced mate when an alternative avoids it.' : `INFERIOR TACTICAL OUTCOME: ${bestMaterial - loss} material units worse than the preferred group.`;
    return [`${move.notation}: ${move.piece} ${move.from} to ${move.to}. ${comparison} ${outcome}.`, developingIds.has(move.uci) ? 'PREFERRED DEVELOPMENT: addresses an opening priority without worsening the detected tactical outcome.' : '', development[move.uci], position.notes[move.uci], loss < 0 || outcome === 'LOSE BY CHECKMATE' ? `Refutation: ${threat?.exchangeLine.join(' ') || 'none'}.` : '', move.promotion ? `Promotes to ${move.promotion}.` : ''].filter(Boolean).join(' ');
  };
  return {
    model: request.model,
    state: {
      sideToMove: request.state.sideToMove,
      pieces: request.state.pieces,
      recentMoves: request.state.moveHistory.slice(-8),
      inCheck: request.state.inCheck,
      position: position.state,
      openingAdvice: developing.length ? { moves: developing.map(move => `${move.uci} (${move.notation})`), reason: 'These moves address castling, unused minor pieces, or initial central pawn development while matching the best detected tactical outcome. Prefer them over moving an already developed piece again without a concrete reason. These are basic opening rules, not an opening book or proof of the best move.' } : undefined,
      advisoryChoices: request.state.perspectives,
      previousProposal: request.state.proposedMove,
      reviewWarning: request.state.warning,
      tacticalComparison: { preferredMoves: preferred.map(move => `${move.uci} (${move.notation})`), explanation: mating.length ? 'These moves checkmate immediately.' : bestMaterial < 0 ? `Every examined option concedes material. The preferred group limits the loss to ${-bestMaterial} units. Other options lose more or allow mate. Save the more valuable pieces even if a pawn must be lost.` : 'These moves have the best worst-case material outcome in the limited tactical calculation. Compare their positional merits. This is advice, not a forced selection.' },
      facts: 'Outcomes are calculated from legal immediate replies and limited forcing exchanges, not a full search. Some strategies also extend quiet attacks by cheaper pieces and knight forks through our response and the next opponent capture or mate. No detected loss does not mean a move is safe. Material units: pawn 1, knight or bishop 3, rook 5, queen 9. A refutation is a legal example line, not a prediction of the actual opponent.'
    },
    questions: { move: {
      type: 'choice',
      instructions: 'Select our best move. First compare the PREFERRED TACTICAL GROUP, then select its strongest positional move. Other moves have a worse detected tactical outcome; choose one only for concrete compensation the calculation misses. When all moves lose material, minimize the loss: saving a queen matters more than saving a pawn. Giving check or developing a rook does not compensate for losing a queen. Develop unused knights and bishops, occupy the center with pawns, and castle before launching attacks. Avoid repeated piece moves without a threat to answer. In endings activate the king and stop enemy passed pawns before advancing our own. All legal moves are available. You make the final choice.',
      criteria: Object.fromEntries(moves.map(move => [move.uci, describe(move)]))
    } }
  };
}
