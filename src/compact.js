import { developmentFacts } from './development.js';

export function compactRequest(request, moves) {
  const development = developmentFacts(request.state.moveHistory, moves);
  const describe = move => {
    const tactics = move.tactics;
    const loss = tactics.worstMaterialChangeInListedExchanges;
    const outcome = move.checkmate ? 'CHECKMATE: win now' : tactics.opponentCanCheckmateImmediately || tactics.opponentCanForceMateAfterCheck ? 'LOSE BY CHECKMATE' : move.draw ? 'DRAW now' : loss < 0 ? `LOSE ${-loss} material units` : loss > 0 ? `GAIN ${loss} material units` : 'No detected material loss';
    const threat = [...tactics.forcingReplies].sort((a, b) => Number(b.opponentCheckmates || b.forcesMateAfterCheck) - Number(a.opponentCheckmates || a.forcesMateAfterCheck) || a.netMaterialChangeAfterExchange - b.netMaterialChangeAfterExchange)[0];
    return [`${move.notation}: ${move.piece} ${move.from} to ${move.to}. ${outcome}.`, development[move.uci], loss < 0 || outcome === 'LOSE BY CHECKMATE' ? `Refutation: ${threat?.exchangeLine.join(' ') || 'none'}.` : '', move.promotion ? `Promotes to ${move.promotion}.` : ''].filter(Boolean).join(' ');
  };
  return {
    model: request.model,
    state: {
      sideToMove: request.state.sideToMove,
      pieces: request.state.pieces,
      recentMoves: request.state.moveHistory.slice(-8),
      inCheck: request.state.inCheck,
      previousProposal: request.state.proposedMove,
      reviewWarning: request.state.warning,
      facts: 'Outcomes are calculated from legal immediate replies and limited forcing exchanges, not a full search. No detected loss does not mean a move is safe. Material units: pawn 1, knight or bishop 3, rook 5, queen 9. A refutation is a legal example line, not a prediction of the actual opponent.'
    },
    questions: { move: {
      type: 'choice',
      instructions: 'Select our best move. Use this priority order: win by checkmate; prevent opponent checkmate; preserve or win material; improve the position. Prefer No detected material loss over LOSE material unless a concrete forced win justifies the loss. Giving check is not compensation for losing a piece. Develop unused knights and bishops, occupy the center with pawns, and castle before launching attacks. Avoid repeated piece moves without a threat to answer. When ahead, trade pieces without losing material. In endings activate the king and advance passed pawns. All legal moves are available. You make the final choice.',
      criteria: Object.fromEntries(moves.map(move => [move.uci, describe(move)]))
    } }
  };
}
