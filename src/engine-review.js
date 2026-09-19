export function engineRequest(request, moves, analysis, previousChoice) {
  const lines = new Map(analysis.lines.map(line => [line.move, line]));
  if (lines.size !== moves.length || moves.some(move => !lines.has(move.uci))) throw new Error('Engine advice does not cover every legal choice');
  const first = analysis.lines.find(line => line.rank === 1);
  const scoreText = score => score.type === 'mate' ? `The engine reports ${score.value > 0 ? 'checkmate for us' : 'checkmate against us'} in ${Math.abs(score.value)} moves.` : `Engine evaluation for our side: ${score.value >= 0 ? '+' : ''}${(score.value / 100).toFixed(2)}. Higher is better.`;
  return {
    model: request.model,
    state: {
      sideToMove: request.state.sideToMove,
      pieces: request.state.pieces,
      recentMoves: request.state.moveHistory.slice(-8),
      assistance: `${analysis.engine} evaluated every legal move. This is an engine-assisted decision.`,
      depth: analysis.depth,
      recommendedMove: first.move,
      recommendedLine: first.san.join(' '),
      previousChoice,
      review: previousChoice ? 'Your proposal differs from the engine first choice. Compare their rankings and concrete lines before selecting the final move.' : undefined
    },
    questions: { move: {
      type: 'choice',
      instructions: 'Choose our strongest chess move using the supplied engine analysis. Prefer ENGINE FIRST CHOICE, the strongest option from the latest complete search iteration. The engine has already compared tactical and positional outcomes. Do not replace its recommendation with a superficial developing move, pawn push, or check. Every legal move remains available. You make the final choice.',
      criteria: Object.fromEntries(moves.map(move => {
        const line = lines.get(move.uci);
        return [move.uci, `${move.notation}. ${line.rank === 1 ? 'ENGINE FIRST CHOICE: recommended strongest move.' : `ENGINE ALTERNATIVE ${line.rank}: ranked below the first choice.`} ${scoreText(line.score)} Calculated line: ${line.san.join(' ')}.`];
      }))
    } }
  };
}
