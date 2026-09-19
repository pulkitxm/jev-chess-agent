import { fromHistory } from './chess.js';

export function developmentFacts(history, moves) {
  const chess = fromHistory(history);
  const side = chess.turn();
  const played = chess.history({ verbose: true });
  const backRank = side === 'w' ? '1' : '8';
  const opening = history.length < 30;
  const undeveloped = ['b', 'c', 'f', 'g'].map(file => `${file}${backRank}`).filter(square => {
    const piece = chess.get(square);
    return piece?.color === side && ['b', 'n'].includes(piece.type);
  });
  return Object.fromEntries(moves.map(move => {
    let square = move.from;
    let previousMoves = 0;
    for (const prior of [...played].reverse()) {
      if (prior.color === side && prior.to === square) {
        previousMoves++;
        square = prior.from;
      }
    }
    const statements = [];
    if (opening && ['bishop', 'knight'].includes(move.piece)) {
      if (!previousMoves && undeveloped.includes(move.from)) statements.push('DEVELOPMENT: brings a previously undeveloped minor piece into play.');
      if (previousMoves) statements.push(`REPEATED PIECE MOVE: this piece has already moved ${previousMoves} times. Other undeveloped minor pieces remain on ${undeveloped.join(', ') || 'none'}. Repetition needs a concrete tactical reason.`);
    }
    if (opening && move.piece === 'pawn' && ['d4', 'e4', 'd5', 'e5'].includes(move.to)) statements.push('CENTER: places a pawn in the central four squares.');
    if (opening && move.piece === 'pawn' && previousMoves && !move.captured && undeveloped.length) statements.push('DEVELOPMENT DELAY: moves the same pawn again while unused knights or bishops still need development.');
    if (opening && move.piece === 'queen' && !move.captured) statements.push('EARLY QUEEN MOVE: minor-piece development and king safety may be more urgent.');
    if (move.notation.startsWith('O-O')) statements.push('KING SAFETY: castles and brings a rook toward the center.');
    if (opening && ['bishop', 'knight'].includes(move.piece)) {
      const blockedPawnSquare = `${move.to[0]}${side === 'w' ? '2' : '7'}`;
      if (['d', 'e'].includes(move.to[0]) && move.to[1] === (side === 'w' ? '3' : '6') && chess.get(blockedPawnSquare)?.type === 'p') statements.push('DEVELOPMENT WARNING: blocks the initial advance of a central pawn.');
    }
    return [move.uci, statements.join(' ')];
  }));
}
