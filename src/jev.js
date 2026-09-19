import { candidates, describeBoard, fromHistory } from './chess.js';
import { tacticalConsequences } from './tactics.js';

export function makeRequest(history, model = 'jev-1.13.0') {
  const chess = fromHistory(history);
  if (chess.isGameOver()) throw new Error('The game is over');
  const moves = candidates(chess).map(move => ({ ...move, tactics: tacticalConsequences(chess, move) }));
  if (moves.length > 255) throw new Error('Too many legal moves for one Choice question');
  return {
    request: {
      model,
      state: {
        game: 'Standard chess',
        sideToMove: chess.turn() === 'w' ? 'White' : 'Black',
        inCheck: chess.isCheck(),
        fen: chess.fen(),
        pieces: describeBoard(chess),
        moveHistory: chess.history(),
        tacticalFacts: 'Material units: pawn=1, knight=3, bishop=3, rook=5, queen=9. Negative material change means we lose material. Exchange lines consider legal recaptures on the same square, up to six more captures, allowing either side to stop exchanging. These are limited tactical facts, not a complete search or proof that a move is safe.',
        objective: 'Win the chess game against a strong opponent. All listed candidates are legal. The board and candidate descriptions are computed by a chess rules library.'
      },
      questions: {
        move: {
          type: 'choice',
          instructions: 'Choose the strongest legal chess move. First take a checkmate if available. Otherwise avoid moves with opponentCanCheckmateImmediately=true. Inspect forcingReplies and exchangeLine before choosing: a check is BAD if the opponent captures the checking piece and the exchange loses material. Prefer preserving material over giving a check or capturing a cheaper pawn. Negative worstMaterialChangeInListedExchanges is a concrete tactical warning, even if the move gives check. Favor moves without these losses when alternatives exist; a sacrifice needs concrete compensation, not just a check. Compare the resulting position, king safety, development, central control, and opponent threats. All legal moves remain available and you alone select the move.',
          criteria: Object.fromEntries(moves.map(({ uci, resultingBoard, ...facts }) => [uci, facts]))
        }
      }
    },
    moves,
    fen: chess.fen()
  };
}

export async function chooseMove(history, { apiKey, model = 'jev-1.13.0', fetchImpl = fetch, signal } = {}) {
  if (!apiKey) throw new Error('Set TYPESAFE_API_KEY in the local .env file');
  const { request, moves, fen } = makeRequest(history, model);
  const started = Date.now();
  const response = await fetchImpl('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`TypeSafe returned HTTP ${response.status}. No move was played.`);
  const result = await response.json();
  const answer = result.answers?.move;
  const selected = moves.find(move => move.uci === answer?.choice);
  if (!selected) throw new Error('TypeSafe returned a move outside the legal candidate list');
  if (!Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1) throw new Error('Invalid confidence');
  return {
    fen,
    move: selected,
    confidence: answer.confidence,
    probabilities: answer.probabilities,
    model: result.model,
    usage: result.usage,
    elapsedMs: Date.now() - started
  };
}
