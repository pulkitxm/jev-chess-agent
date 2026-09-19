export function semanticRequest(request, moves) {
  return {
    model: request.model,
    state: {
      sideToMove: request.state.sideToMove,
      pieces: request.state.pieces,
      moveHistory: request.state.moveHistory,
      inCheck: request.state.inCheck,
      objective: 'Win a standard chess game. The opponent always tries to refute our moves. The supplied exchange warnings are computed from legal moves, but do not cover every tactic.'
    },
    questions: { move: {
      type: 'choice',
      instructions: 'Which legal move gives us the strongest chess position? Choose immediate checkmate when available. Avoid allowing checkmate or losing material when possible. A move that gives check but loses a piece is bad. In the opening develop knights and bishops toward the center, contest central squares, and castle. Avoid moving the same piece repeatedly or bringing the queen out early without a concrete reason. In the middlegame preserve pieces, keep the king protected, and coordinate threats. In an endgame activate the king and advance passed pawns. Select a move yourself from all legal options.',
      criteria: Object.fromEntries(moves.map(move => {
        const tactics = move.tactics;
        const loss = tactics.worstMaterialChangeInListedExchanges;
        const warnings = tactics.forcingReplies.filter(reply => reply.opponentCheckmates || reply.netMaterialChangeAfterExchange < 0).slice(0, 3);
        return [move.uci, [
          `Move our ${move.piece} from ${move.from} to ${move.to} (${move.notation}).`,
          move.captured ? `Captures an enemy ${move.captured}.` : 'Does not capture.',
          move.checkmate ? 'Wins the game immediately by checkmate.' : '',
          move.draw ? 'Ends the game in a draw.' : '',
          tactics.opponentCanCheckmateImmediately ? 'DANGER: the opponent can checkmate us immediately after this move.' : '',
          tactics.forcingReplies.some(reply => reply.capturedPiece === 'q' && reply.netMaterialChangeAfterExchange < 0) ? 'QUEEN LOSS: our queen can be captured without full material compensation in the examined exchange.' : '',
          loss < 0 ? `DANGER: the opponent can cause a net material loss of ${-loss} pawn units in the examined exchanges.` : loss > 0 ? `The examined exchanges retain a material gain of ${loss} pawn units.` : 'No material loss found in the examined immediate exchanges; deeper threats may still exist.',
          ...warnings.map(reply => `Opponent response ${reply.reply}: ${reply.opponentCheckmates ? 'checkmates us' : `we lose ${-reply.netMaterialChangeAfterExchange} pawn units`}. Line: ${reply.exchangeLine.join(' ')}.`)
        ].filter(Boolean).join(' ')];
      }))
    } }
  };
}
