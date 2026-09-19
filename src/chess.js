import { Chess } from 'chess.js';

const names = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

export function fromHistory(history = []) {
  if (!Array.isArray(history) || history.length > 1000) throw new Error('Invalid move history');
  const chess = new Chess();
  for (const move of history) chess.move(move);
  return chess;
}

export function placement(chess) {
  return chess.fen().split(' ')[0];
}

export function describeBoard(chess) {
  return chess.board().flat().filter(Boolean).map(piece =>
    `${piece.color === 'w' ? 'White' : 'Black'} ${names[piece.type]} on ${piece.square}`
  );
}

export function candidates(chess) {
  return chess.moves({ verbose: true }).map(move => {
    chess.move(move);
    const result = {
      uci: `${move.from}${move.to}${move.promotion || ''}`,
      notation: move.san,
      piece: names[move.piece],
      from: move.from,
      to: move.to,
      captured: move.captured ? names[move.captured] : null,
      promotion: move.promotion ? names[move.promotion] : null,
      givesCheck: chess.isCheck(),
      checkmate: chess.isCheckmate(),
      draw: chess.isDraw(),
      resultingBoard: describeBoard(chess)
    };
    chess.undo();
    return result;
  });
}

export function reconcile(chess, observed) {
  if (placement(chess) === observed) return null;
  const matching = [];
  for (const move of chess.moves({ verbose: true })) {
    chess.move(move);
    if (placement(chess) === observed) matching.push(move);
    chess.undo();
  }
  if (matching.length !== 1) throw new Error('Board is not a single legal move ahead. Pause and start a fresh standard game.');
  chess.move(matching[0]);
  return matching[0];
}

export function gameResult(chess) {
  if (chess.isCheckmate()) return chess.turn() === 'w' ? '0-1' : '1-0';
  if (chess.isDraw()) return '1/2-1/2';
  return '*';
}
