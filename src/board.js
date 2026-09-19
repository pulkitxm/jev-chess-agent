export function isBotUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['www.chess.com', 'chess.com'].includes(url.hostname) && /^\/play\/computer(?:\/|$)/.test(url.pathname);
  } catch { return false; }
}

export function readBoard(document) {
  const board = document.querySelector('#board-play-computer');
  if (!board) throw new Error('No bot board found. Open chess.com Play Bots.');
  const squares = new Map();
  for (const element of board.querySelectorAll('.piece')) {
    if (element.closest('.promotion-window') || element.style.display === 'none') continue;
    const piece = element.className.match(/\b([wb][pnbrqk])\b/)?.[1];
    const square = element.className.match(/\bsquare-([1-8])([1-8])\b/);
    if (!piece || !square) continue;
    const key = `${square[1]}${square[2]}`;
    if (squares.has(key)) throw new Error('Board animation is still in progress');
    squares.set(key, piece[0] === 'w' ? piece[1].toUpperCase() : piece[1]);
  }
  if ([...squares.values()].filter(p => p === 'K').length !== 1 || [...squares.values()].filter(p => p === 'k').length !== 1) throw new Error('Incomplete board');
  const ranks = [];
  for (let rank = 8; rank >= 1; rank--) {
    let text = '', empty = 0;
    for (let file = 1; file <= 8; file++) {
      const piece = squares.get(`${file}${rank}`);
      if (!piece) empty++;
      else { if (empty) text += empty; empty = 0; text += piece; }
    }
    if (empty) text += empty;
    ranks.push(text);
  }
  const rect = board.getBoundingClientRect();
  if (rect.width < 100 || rect.height < 100) throw new Error('Board is not visible');
  return {
    placement: ranks.join('/'),
    flipped: board.classList.contains('flipped'),
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    active: [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Resign' || button.getAttribute('aria-label') === 'Resign'),
    opponent: document.querySelector('#board-layout-player-top')?.textContent?.trim() || 'Computer bot'
  };
}

export function squarePoint(square, board) {
  if (!/^[a-h][1-8]$/.test(square)) throw new Error('Invalid square');
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return {
    x: board.rect.x + (board.flipped ? 7.5 - file : file + 0.5) * board.rect.width / 8,
    y: board.rect.y + (board.flipped ? rank + 0.5 : 7.5 - rank) * board.rect.height / 8
  };
}
