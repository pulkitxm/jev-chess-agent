import { candidates, describeBoard, fromHistory } from './chess.js';
import { tacticalConsequences } from './tactics.js';
import { semanticRequest } from './strategy.js';
import { compactRequest } from './compact.js';

function moveFacts(move, limit = 6) {
  const replies = [...move.tactics.forcingReplies].sort((a, b) => Number(b.opponentCheckmates) - Number(a.opponentCheckmates) || a.netMaterialChangeAfterExchange - b.netMaterialChangeAfterExchange);
  return {
    san: move.notation,
    checkmate: move.checkmate,
    draw: move.draw,
    allowsMate: move.tactics.opponentCanCheckmateImmediately || move.tactics.opponentCanForceMateAfterCheck,
    materialChange: move.tactics.worstMaterialChangeInListedExchanges,
    queenWarning: queenLoss(move) ? 'Our queen can be captured and the examined exchange does not recover its full material value.' : null,
    replyCount: move.tactics.opponentLegalReplies.length,
    forcingReplyCount: replies.length,
    shownReplies: replies.slice(0, limit).map(reply => ({ san: reply.reply, materialChange: reply.netMaterialChangeAfterExchange, mate: reply.opponentCheckmates, line: reply.exchangeLine.join(' ') }))
  };
}

function queenLoss(move) {
  return move.tactics.forcingReplies.some(reply => reply.capturedPiece === 'q' && reply.netMaterialChangeAfterExchange < 0);
}

function boundRequest(request, moves) {
  for (let limit = 6; limit >= 0; limit--) {
    request.questions.move.criteria = Object.fromEntries(moves.map(move => [move.uci, moveFacts(move, limit)]));
    if (JSON.stringify(request).length <= 32000) return request;
  }
  throw new Error('Chess request exceeds the local size budget');
}

export function makeRequest(history, model = 'jev-1.13.0', { extendChecks = false } = {}) {
  const chess = fromHistory(history);
  if (chess.isGameOver()) throw new Error('The game is over');
  const moves = candidates(chess).map(move => ({ ...move, tactics: tacticalConsequences(chess, move, { extendChecks }) }));
  if (moves.length > 255) throw new Error('Too many legal moves for one Choice question');
  const request = {
      model,
      state: {
        game: 'Standard chess',
        sideToMove: chess.turn() === 'w' ? 'White' : 'Black',
        inCheck: chess.isCheck(),
        fen: chess.fen(),
        pieces: describeBoard(chess),
        moveHistory: chess.history(),
        tacticalFacts: 'Material units: pawn=1, knight=3, bishop=3, rook=5, queen=9. Negative material change means we lose material. Exchange lines consider legal recaptures on the same square, up to six more captures, allowing either side to stop exchanging. materialChange is our worst material change across examined forcing replies. shownReplies lists a bounded sample of the most dangerous replies; replyCount and forcingReplyCount include omitted replies. These are limited tactical facts, not a complete search or proof that a move is safe.',
        objective: 'Win the chess game against a strong opponent. All listed candidates are legal. The board and candidate descriptions are computed by a chess rules library.'
      },
      questions: {
        move: {
          type: 'choice',
          instructions: 'Choose the strongest legal chess move. First take a checkmate if available. Otherwise avoid moves with allowsMate=true. Inspect shownReplies and their line before choosing: a check is BAD if the opponent captures the checking piece and the exchange loses material. Prefer preserving material over giving a check or capturing a cheaper pawn. Negative materialChange is a concrete tactical warning, even if the move gives check. Favor moves without these losses when alternatives exist; a sacrifice needs concrete compensation, not just a check. Compare the resulting position, king safety, development, central control, and opponent threats. All legal moves remain available and you alone select the move.',
          criteria: {}
        }
      }
    };
  return { request: boundRequest(request, moves), moves, fen: chess.fen() };
}

export async function chooseMove(history, { apiKey, model = 'jev-1.13.0', fetchImpl = fetch, signal, strategy = 'original' } = {}) {
  if (!apiKey) throw new Error('Set TYPESAFE_API_KEY in the local .env file');
  const started = Date.now();
  const { request, moves, fen } = makeRequest(history, model, { extendChecks: ['foresight', 'deliberate', 'development', 'compact'].includes(strategy) });
  const rounds = [];
  const ask = async payload => {
    const response = await fetchImpl('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`TypeSafe returned HTTP ${response.status}. No move was played.`);
    const result = await response.json();
    const answer = result.answers?.move;
    const selected = moves.find(move => move.uci === answer?.choice);
    if (!selected) throw new Error('TypeSafe returned a move outside the legal candidate list');
    if (!Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1) throw new Error('Invalid confidence');
    const perspectives = Object.fromEntries(Object.entries(result.answers || {}).filter(([name]) => name !== 'move').map(([name, value]) => {
      if (!moves.some(move => move.uci === value.choice)) throw new Error('An advisory answer is not a legal move');
      return [name, value.choice];
    }));
    rounds.push({ choice: selected.uci, confidence: answer.confidence, usage: result.usage, perspectives });
    return { result, answer, selected };
  };
  if (!['original', 'semantic', 'foresight', 'deliberate', 'development', 'compact'].includes(strategy)) throw new Error('Unknown decision strategy');
  const initial = strategy === 'compact' ? compactRequest(request, moves) : strategy !== 'original' ? semanticRequest(request, moves, { development: strategy === 'development' }) : request;
  if (strategy === 'deliberate') {
    initial.questions.defense = { ...initial.questions.move, instructions: 'Which legal move best defends our king, queen, and other pieces against the strongest opponent reply? Prefer preventing mate and serious material losses. Compare the supplied exchange warnings. Do not favor a check or capture merely because it is forcing.' };
    initial.questions.coordination = { ...initial.questions.move, instructions: 'Which legal move most improves the coordination and activity of our pieces without neglecting concrete threats? Prefer central control, developing undeveloped pieces, king safety, and useful pawn advances. Avoid purposeless repeated moves and premature attacks. Consider the complete board.' };
  }
  let picked = await ask(initial);
  const warned = picked.selected.tactics;
  const saferExists = moves.some(move => !move.tactics.opponentCanCheckmateImmediately && !move.tactics.opponentCanForceMateAfterCheck && move.tactics.worstMaterialChangeInListedExchanges >= 0);
  const tacticalWarning = queenLoss(picked.selected) || warned.opponentCanCheckmateImmediately || warned.opponentCanForceMateAfterCheck || (saferExists && warned.worstMaterialChangeInListedExchanges < 0);
  if (strategy === 'deliberate' || tacticalWarning) {
    const review = boundRequest({
      model,
      state: {
        ...request.state,
        proposedMove: picked.selected.notation,
        warning: tacticalWarning ? `Your proposed move permits a concrete material loss or forced checkmate. ${saferExists ? 'Alternatives without that detected loss exist.' : 'No alternative is certified free of material loss by these limited checks. Compare the actual losses, queen safety, and mate threats before deciding.'} Giving check alone does not compensate for losing a piece. Reconsider using the exchange lines; you remain the sole final move selector.` : 'Compare your initial choice with your separate defensive and piece-coordination assessments, then choose the strongest final move. All legal options remain available. These assessments are your own opinions, not an external engine or proof.',
        perspectives: rounds[0].perspectives,
        proposedConsequences: moveFacts(picked.selected, 3)
      },
      questions: { move: {
        type: 'choice',
        instructions: 'Select the best FINAL move. Prioritize avoiding immediate checkmate and losing material. A zero or positive materialChange is preferable to a negative value unless there is a concrete forced win. Do not sacrifice a bishop for a pawn or a rook for a bishop simply to give check. Every legal move is available, including the original proposal.',
        criteria: {}
      } }
    }, moves);
    picked = await ask(strategy === 'compact' ? compactRequest(review, moves) : strategy !== 'original' ? semanticRequest(review, moves, { development: strategy === 'development' }) : review);
  }
  const usage = rounds.reduce((sum, round) => ({ input_tokens: sum.input_tokens + (round.usage?.input_tokens || 0), output_tokens: sum.output_tokens + (round.usage?.output_tokens || 0) }), { input_tokens: 0, output_tokens: 0 });
  return {
    fen,
    move: picked.selected,
    confidence: picked.answer.confidence,
    probabilities: picked.answer.probabilities,
    model: picked.result.model,
    usage,
    decisionRounds: rounds,
    strategy,
    elapsedMs: Date.now() - started
  };
}
