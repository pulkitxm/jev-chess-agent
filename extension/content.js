import { isBotUrl, readBoard, squarePoint } from '../src/board.js';

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  try {
    if (!isBotUrl(location.href)) throw new Error('Only chess.com computer games are supported');
    if (message.type === 'snapshot') return respond({ ok: true, board: readBoard(document) });
    if (message.type === 'point') {
      const board = readBoard(document);
      if (board.placement !== message.expected) throw new Error('Board changed before click');
      const point = squarePoint(message.square, board);
      const target = document.elementFromPoint(point.x, point.y);
      if (!target?.closest('#board-play-computer')) throw new Error('The board is covered by another element');
      return respond({ ok: true, point });
    }
    if (message.type === 'promotion') {
      const board = document.querySelector('#board-play-computer');
      const choices = [...board.querySelectorAll('.promotion-piece, .promotion-window .piece')];
      const target = choices.find(element => element.classList.contains(message.color + message.piece));
      if (!target) throw new Error('Promotion choice not found. Select the requested piece manually, then resume.');
      const rect = target.getBoundingClientRect();
      return respond({ ok: true, point: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } });
    }
    respond({ ok: false, error: 'Unknown board operation' });
  } catch (error) { respond({ ok: false, error: error.message }); }
});
