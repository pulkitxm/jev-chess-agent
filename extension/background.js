import { fromHistory, placement, reconcile, gameResult } from '../src/chess.js';
import { isBotUrl } from '../src/board.js';

let run = null;
let generation = 0;
let state = { status: 'Ready', history: [], running: false };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function publish(update) {
  state = { ...state, ...update };
  await chrome.storage.session.set({ state });
}

async function boardMessage(tabId, message) {
  const tab = await chrome.tabs.get(tabId);
  if (!isBotUrl(tab.url)) throw new Error('Navigation left the bot game. Agent stopped.');
  const response = await chrome.tabs.sendMessage(tabId, message);
  if (!response?.ok) throw new Error(response?.error || 'Reload the bot page after installing the extension');
  return response;
}

async function snapshot(tabId) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try { return (await boardMessage(tabId, { type: 'snapshot' })).board; }
    catch (error) {
      if (!/animation|Incomplete board/.test(error.message) || attempt === 7) throw error;
      await delay(150);
    }
  }
}

async function service(path, payload) {
  const { pairing } = await chrome.storage.local.get('pairing');
  if (!pairing) throw new Error('Paste the local pairing code first');
  const response = await fetch(`http://127.0.0.1:4318/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pairing}` },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(35000)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Local service failed');
  return data;
}

async function saveGame() {
  if (!run) return;
  await service('game', { id: run.id, history: run.chess.history() });
  await chrome.storage.session.set({ savedGame: { id: run.id, tabId: run.tabId, color: run.color, history: run.chess.history() } });
  await publish({ history: run.chess.history(), fen: run.chess.fen(), result: gameResult(run.chess) });
}

async function clickPoint(tabId, point, current) {
  if (current !== generation) throw new Error('Paused');
  const tab = await chrome.tabs.get(tabId);
  if (!isBotUrl(tab.url)) throw new Error('Navigation left the bot game');
  if (current !== generation) throw new Error('Paused');
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
}

async function performMove(decision, current) {
  const expected = placement(run.chess);
  if (decision.fen !== run.chess.fen()) throw new Error('Decision belongs to a stale position');
  const before = await boardMessage(run.tabId, { type: 'snapshot' });
  if (!before.board.active) throw new Error('Bot game is no longer active');
  const from = await boardMessage(run.tabId, { type: 'point', square: decision.move.from, expected });
  await clickPoint(run.tabId, from.point, current);
  await delay(80);
  const to = await boardMessage(run.tabId, { type: 'point', square: decision.move.to, expected });
  await clickPoint(run.tabId, to.point, current);
  if (decision.move.promotion) {
    await delay(200);
    const promotion = await boardMessage(run.tabId, { type: 'promotion', color: run.color, piece: decision.move.uci[4] });
    await clickPoint(run.tabId, promotion.point, current);
  }
  const next = fromHistory(run.chess.history());
  next.move({ from: decision.move.from, to: decision.move.to, promotion: decision.move.uci[4] });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline && current === generation) {
    await delay(250);
    const observed = await snapshot(run.tabId);
    if (observed.placement === expected) continue;
    try {
      reconcile(next, observed.placement);
      run.chess = next;
      await saveGame();
      return;
    } catch { }
  }
  throw new Error('Move was not confirmed. Agent stopped to prevent a duplicate move.');
}

async function stop(status = 'Paused') {
  generation++;
  const tabId = run?.tabId;
  if (tabId) await chrome.debugger.detach({ tabId }).catch(() => {});
  await publish({ status, running: false });
}

async function play(message) {
  if (state.running) return;
  state.running = true;
  const current = ++generation;
  const tab = await chrome.tabs.get(message.tabId);
  if (!isBotUrl(tab.url)) throw new Error('Open chess.com Play Bots first');
  if (!['w', 'b'].includes(message.color)) throw new Error('Choose the color you are playing');
  const observed = (await boardMessage(tab.id, { type: 'snapshot' })).board;
  if (!observed.active) throw new Error('Start the bot game using its Play button first');
  const saved = (await chrome.storage.session.get('savedGame')).savedGame;
  const fresh = fromHistory([]);
  let chess, id;
  if (placement(fresh) === observed.placement) { chess = fresh; id = crypto.randomUUID(); }
  else if (saved?.tabId === tab.id && saved.color === message.color) {
    chess = fromHistory(saved.history);
    reconcile(chess, observed.placement);
    id = saved.id;
  } else {
    chess = fresh;
    if (message.color !== 'b') throw new Error('Start a fresh standard game before connecting');
    reconcile(chess, observed.placement);
    id = crypto.randomUUID();
  }
  if (current !== generation) return;
  run = { tabId: tab.id, chess, id, color: message.color };
  await chrome.debugger.attach({ tabId: tab.id }, '1.3');
  if (current !== generation) { await chrome.debugger.detach({ tabId: tab.id }).catch(() => {}); return; }
  await publish({ running: true, status: 'Watching the board', lastDecision: null });
  let ownMoves = 0;
  try {
    await saveGame();
    while (current === generation) {
      const first = await snapshot(tab.id);
      await delay(300);
      const second = await snapshot(tab.id);
      if (current !== generation) return;
      if (first.placement !== second.placement) continue;
      reconcile(run.chess, second.placement);
      await saveGame();
      if (run.chess.isGameOver()) { await stop(`Game finished: ${gameResult(run.chess)}`); return; }
      if (!second.active) { await stop('Game ended or left the active board'); return; }
      if (run.chess.turn() !== run.color) { await publish({ status: 'Waiting for the bot' }); await delay(500); continue; }
      if (ownMoves >= 150) { await stop('Move limit reached'); return; }
      await publish({ status: 'Jev is choosing a move' });
      const decision = await service('choose', { history: run.chess.history(), fen: run.chess.fen() });
      if (current !== generation) return;
      await publish({ status: `Playing ${decision.move.notation}`, lastDecision: { san: decision.move.notation, confidence: decision.confidence, elapsedMs: decision.elapsedMs, model: decision.model } });
      await performMove(decision, current);
      ownMoves++;
      if (message.once) { await stop('Move played. Ready for the next turn.'); return; }
    }
  } catch (error) {
    if (current === generation) await stop(error.message);
  }
}

chrome.debugger.onDetach.addListener(({ tabId }) => {
  if (run?.tabId === tabId && state.running) { generation++; publish({ running: false, status: 'Browser control detached. Paused.' }); }
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.tab) return;
  if (message.type === 'stop') { stop().then(() => respond({ ok: true })); return true; }
  if (message.type === 'start') {
    play(message).catch(error => publish({ running: false, status: error.message }));
    respond({ ok: true });
  }
});
