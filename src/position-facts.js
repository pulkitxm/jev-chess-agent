const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const pieces = chess => chess.board().flat().filter(Boolean);
const distance = (a, b) => Math.max(Math.abs(a.charCodeAt(0) - b.charCodeAt(0)), Math.abs(Number(a[1]) - Number(b[1])));
const promotionSquare = pawn => `${pawn.square[0]}${pawn.color === 'w' ? '8' : '1'}`;
const ranksLeft = pawn => Math.abs(Number(promotionSquare(pawn)[1]) - Number(pawn.square[1]));
const centerDistance = square => Math.min(...['d4', 'e4', 'd5', 'e5'].map(center => distance(square, center)));

export function passedPawns(chess, color) {
  const pawns = pieces(chess).filter(piece => piece.type === 'p');
  return pawns.filter(pawn => pawn.color === color && !pawns.some(enemy => enemy.color !== color && Math.abs(enemy.square.charCodeAt(0) - pawn.square.charCodeAt(0)) <= 1 && (Number(enemy.square[1]) - Number(pawn.square[1])) * (color === 'w' ? 1 : -1) > 0)).sort((a, b) => ranksLeft(a) - ranksLeft(b));
}

export function positionFacts(chess, moves) {
  const side = chess.turn();
  const enemy = side === 'w' ? 'b' : 'w';
  const board = pieces(chess);
  const balance = board.reduce((sum, piece) => sum + values[piece.type] * (piece.color === side ? 1 : -1), 0);
  const endgame = !board.some(piece => piece.type === 'q') && board.filter(piece => !['p', 'k'].includes(piece.type)).length <= 6;
  const friendlyPassed = passedPawns(chess, side);
  const enemyPassed = passedPawns(chess, enemy);
  const king = board.find(piece => piece.type === 'k' && piece.color === side);
  const castling = chess.getCastlingRights(side);
  const home = side === 'w' ? '1' : '8';
  const undeveloped = board.filter(piece => piece.color === side && ((piece.type === 'n' && ['b', 'g'].includes(piece.square[0])) || (piece.type === 'b' && ['c', 'f'].includes(piece.square[0]))) && piece.square[1] === home).map(piece => piece.square);
  const opening = chess.history().length < 24 && undeveloped.length > 0;
  const developmentPriority = Object.fromEntries(moves.map(move => {
    const pawnHome = `${move.from[0]}${side === 'w' ? '2' : '7'}`;
    const initialCenterPawn = move.piece === 'pawn' && ['d', 'e'].includes(move.from[0]) && move.from === pawnHome;
    const blocksCenterPawn = ['d', 'e'].includes(move.to[0]) && move.to[1] === (side === 'w' ? '3' : '6') && chess.get(`${move.to[0]}${side === 'w' ? '2' : '7'}`)?.type === 'p';
    const developsMinor = undeveloped.includes(move.from) && !blocksCenterPawn && !(move.piece === 'knight' && ['a', 'h'].includes(move.to[0]));
    return [move.uci, !opening ? 0 : move.notation.startsWith('O-O') ? 2 : developsMinor || initialCenterPawn ? 1 : 0];
  }));
  const pawnDescription = pawn => `${pawn.square}, ${ranksLeft(pawn)} ranks from promotion on ${promotionSquare(pawn)}`;
  const state = {
    material: balance > 0 ? `We are ahead by ${balance} material units.` : balance < 0 ? `We are behind by ${-balance} material units.` : 'Material is equal.',
    phase: endgame ? 'Queenless ending. Activate the king when safe, coordinate rooks, and stop enemy passed pawns.' : 'Opening or middlegame. Develop pieces and protect the king.',
    ourPassedPawns: friendlyPassed.map(pawnDescription),
    enemyPassedPawns: enemyPassed.map(pawnDescription),
    undevelopedMinorPieces: undeveloped,
    pawnReminder: 'Passed means no enemy pawn ahead on the same or neighboring files. Pieces can still block or capture it. Distances do not prove a forced promotion.'
  };
  const notes = Object.fromEntries(moves.map(candidate => {
    const facts = [];
    const move = chess.move({ from: candidate.from, to: candidate.to, promotion: candidate.uci[4] });
    try {
      const remaining = passedPawns(chess, enemy);
      if (enemyPassed.some(pawn => !chess.get(pawn.square) || chess.get(pawn.square)?.color !== enemy)) facts.push('PAWN DEFENSE: removes an enemy passed pawn.');
      if (move.piece === 'p') {
        const passer = passedPawns(chess, side).find(pawn => pawn.square === move.to);
        if (passer) facts.push(`PASSED PAWN: ${pawnDescription(passer)}.`);
      }
      if (move.piece === 'k' && !candidate.notation.startsWith('O-O') && (castling.k || castling.q)) facts.push('KING SAFETY: permanently gives up castling.');
      if (endgame && move.piece === 'k' && remaining.length) {
        const target = promotionSquare(remaining[0]);
        const before = distance(king.square, target);
        const after = distance(move.to, target);
        if (after !== before && Math.max(before, after) > ranksLeft(remaining[0])) facts.push(`KING DEFENSE: moves ${after < before ? 'closer to' : 'farther from'} the enemy passed pawn's promotion square ${target}.`);
      }
      if (endgame && move.piece === 'k' && centerDistance(move.to) < centerDistance(move.from)) {
        facts.push('KING ACTIVITY: brings the king closer to the center in a queenless ending.');
      }
      for (const pawn of remaining.filter(pawn => ranksLeft(pawn) <= 3)) {
        const block = `${pawn.square[0]}${Number(pawn.square[1]) + (enemy === 'w' ? 1 : -1)}`;
        if (move.to === block) facts.push(`BLOCKADE: occupies the square directly ahead of the enemy passed pawn on ${pawn.square}.`);
        if (move.from === block) facts.push(`PAWN DANGER: removes our blockade of the enemy passed pawn on ${pawn.square}.`);
      }
    } finally { chess.undo(); }
    return [candidate.uci, facts.join(' ')];
  }));
  return { state, notes, developmentPriority };
}
