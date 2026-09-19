import { candidates, describeBoard, fromHistory } from './chess.js';

export function makeRequest(history, model = 'jev-1.13.0') {
  const chess = fromHistory(history);
  if (chess.isGameOver()) throw new Error('The game is over');
  const moves = candidates(chess);
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
        objective: 'Win the chess game against a strong opponent. All listed candidates are legal. The board and candidate descriptions are computed by a chess rules library.'
      },
      questions: {
        move: {
          type: 'choice',
          instructions: 'Which legal move gives the side to move the strongest chess position? Choose a checkmating move when available. Otherwise consider opponent threats, king safety, undefended pieces, forcing checks and captures, development and central control. Avoid losing material or allowing mate. Select the best move from the supplied candidates. You are the sole move selector.',
          criteria: Object.fromEntries(moves.map(({ uci, ...facts }) => [uci, facts]))
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
