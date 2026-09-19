import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { isBotUrl, readBoard, squarePoint } from '../src/board.js';

function fixture(classes = 'board') {
  const dom = new JSDOM(`<wc-chess-board id="board-play-computer" class="${classes}"><div class="piece wk square-51"></div><div class="piece bk square-58"></div><div class="piece wp square-52"></div></wc-chess-board><button aria-label="Resign"></button>`);
  dom.window.document.querySelector('#board-play-computer').getBoundingClientRect = () => ({ x: 20, y: 30, width: 800, height: 800 });
  return dom.window.document;
}

test('reads pieces from rendered board classes and recognizes an active bot game', () => {
  const board = readBoard(fixture());
  assert.equal(board.placement, '4k3/8/8/8/8/8/4P3/4K3');
  assert.equal(board.active, true);
  assert.deepEqual(squarePoint('e2', board), { x: 470, y: 680 });
});

test('coordinates correctly follow a flipped board', () => {
  assert.deepEqual(squarePoint('e2', readBoard(fixture('board flipped'))), { x: 370, y: 180 });
});

test('refuses ambiguous animation frames', () => {
  const document = fixture();
  document.querySelector('#board-play-computer').insertAdjacentHTML('beforeend', '<div class="piece bp square-52"></div>');
  assert.throws(() => readBoard(document), /animation/);
});

test('only bot routes on the exact chess.com hosts are permitted', () => {
  assert.equal(isBotUrl('https://www.chess.com/play/computer/Komodo25'), true);
  for (const url of ['https://www.chess.com/play/online', 'https://www.chess.com/game/live/123', 'https://www.chess.com.evil.test/play/computer', 'http://www.chess.com/play/computer', 'https://www.chess.com/play/computerized']) assert.equal(isBotUrl(url), false);
});
