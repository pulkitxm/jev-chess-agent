import { isBotUrl, squarePoint } from './board.js';

export function readVisibleGame() {
  const board = document.querySelector('#board-play-computer');
  const list = document.querySelector('wc-simple-move-list');
  if (!board || !list) throw new Error('Bot board or visible move list is unavailable');
  const nodes = [...list.querySelectorAll('.main-line-ply')];
  const history = nodes.map(node => {
    const content = node.querySelector('.node-highlight-content') || node;
    const figurine = content.querySelector('[data-figurine]')?.getAttribute('data-figurine') || '';
    return figurine + content.textContent.replace(/\s+/g, '');
  });
  const selected = nodes.findIndex(node => node.matches('.selected') || node.querySelector('.selected'));
  const rect = board.getBoundingClientRect();
  if (rect.width < 100 || rect.height < 100) throw new Error('Board is not visible');
  return {
    history,
    latest: nodes.length === 0 || selected === nodes.length - 1,
    active: [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Resign' || button.getAttribute('aria-label') === 'Resign'),
    flipped: board.classList.contains('flipped'),
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  };
}

function isResultUrl(value) {
  const url = new URL(value);
  return url.protocol === 'https:' && ['www.chess.com', 'chess.com'].includes(url.hostname) && /^\/game\/computer\/\d+$/.test(url.pathname);
}

export function browserGame(page) {
  const checkUrl = () => { if (!isBotUrl(page.url())) throw new Error('Navigation left the computer game'); };
  const observe = async () => {
    if (!isBotUrl(page.url()) && !isResultUrl(page.url())) throw new Error('Navigation left the computer game');
    return page.evaluate(readVisibleGame);
  };
  const play = async (move, expected, check) => {
    for (const square of [move.from, move.to]) {
      check();
      checkUrl();
      const board = await observe();
      if (!board.active || !board.latest || JSON.stringify(board.history) !== JSON.stringify(expected)) throw new Error('Position changed before clicking');
      const point = squarePoint(square, board);
      const uncovered = await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('#board-play-computer')), point);
      if (!uncovered) throw new Error('Board is covered by another element');
      check();
      checkUrl();
      await page.mouse.click(point.x, point.y);
    }
    if (move.promotion) {
      const choice = page.locator(`.promotion-window .w${move.uci[4]}, .promotion-piece.w${move.uci[4]}`);
      await choice.first().waitFor({ state: 'visible', timeout: 2000 });
      check();
      checkUrl();
      await choice.first().click();
    }
  };
  return { observe, play };
}

export const engines = { maximum: { name: 'Maximum', path: 'Komodo25' }, beginner: { name: 'Beginner', path: 'Komodo1' } };

export async function startEngine(page, signal, opponent = 'maximum') {
  const engine = engines[opponent];
  if (!engine) throw new Error('Unknown engine');
  await page.goto(`https://www.chess.com/play/computer/${engine.path}`, { waitUntil: 'domcontentloaded' });
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    if (!isBotUrl(page.url())) throw new Error('Site redirected away from the bot page. No login or human-game automation was attempted.');
    if (await page.getByRole('button', { name: 'Resign', exact: true }).isVisible()) return;
    const onboarding = page.getByRole('button', { name: 'Start', exact: true });
    if (await onboarding.isVisible()) {
      try { await onboarding.click({ timeout: 750 }); }
      catch (error) { if (error.name !== 'TimeoutError') throw error; }
      continue;
    }
    const newGame = page.getByRole('button', { name: 'New Game', exact: true });
    if (await newGame.isVisible()) {
      try { await newGame.click({ timeout: 750 }); }
      catch (error) { if (error.name !== 'TimeoutError') throw error; }
      continue;
    }
    const play = page.getByRole('button', { name: 'Play', exact: true });
    if (await play.isVisible()) {
      if (!page.url().endsWith(`/${engine.path}`)) throw new Error(`${engine.name} is not selected`);
      try { await play.click({ timeout: 750 }); }
      catch (error) { if (error.name !== 'TimeoutError') throw error; }
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Game setup timed out. A site prompt may need attention.');
}
