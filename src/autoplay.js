import { fromHistory, gameResult } from './chess.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function validateProgress(previous, next) {
  if (next.length < previous.length || previous.some((move, index) => move !== next[index])) throw new Error('Move history changed unexpectedly');
  return fromHistory(next);
}

export async function autoplay({ observe, choose, play, save, log = console.log, signal, maxMoves = 150, maxSeconds = 900, color = 'w' }) {
  const deadline = Date.now() + maxSeconds * 1000;
  let history = [];
  let decisions = 0;
  let lastSaved = -1;
  const check = () => {
    signal?.throwIfAborted();
    if (Date.now() >= deadline) throw new Error('Time limit reached');
  };
  while (true) {
    check();
    const observed = await observe();
    const chess = validateProgress(history, observed.history);
    history = chess.history();
    if (history.length !== lastSaved) { await save(chess); lastSaved = history.length; }
    if (chess.isGameOver()) return { result: gameResult(chess), decisions, history, reason: 'Game finished' };
    if (!observed.active) {
      for (let attempt = 0; attempt < 8; attempt++) {
        await sleep(150);
        check();
        const final = await observe();
        const finalChess = validateProgress(history, final.history);
        history = finalChess.history();
        await save(finalChess);
        lastSaved = history.length;
        if (finalChess.isGameOver()) return { result: gameResult(finalChess), decisions, history, reason: 'Game finished' };
        if (final.active) break;
        if (attempt === 7) return { result: '*', decisions, history, reason: 'Board is no longer active' };
      }
      continue;
    }
    if (!observed.latest) throw new Error('Board is showing an earlier move');
    if (chess.turn() !== color) { await sleep(100); continue; }
    if (decisions >= maxMoves) return { result: '*', decisions, history, reason: 'Move limit reached' };
    await sleep(150);
    const stable = await observe();
    if (JSON.stringify(stable.history) !== JSON.stringify(history)) continue;
    if (!stable.latest || !stable.active) throw new Error('Board changed before decision');
    check();
    const decision = await choose(history);
    decisions++;
    check();
    if (decision.fen !== chess.fen()) throw new Error('Decision belongs to a different position');
    const move = chess.move({ from: decision.move.from, to: decision.move.to, promotion: decision.move.uci[4] });
    const before = await observe();
    if (!before.active || !before.latest || JSON.stringify(before.history) !== JSON.stringify(history)) throw new Error('Board changed while Jev was choosing');
    check();
    await play(decision.move, history, check);
    const confirmBy = Date.now() + 8000;
    while (true) {
      check();
      const after = await observe();
      validateProgress(history, after.history);
      if (after.history.length > history.length) {
        if (after.history[history.length] !== move.san) throw new Error('Site played a different move');
        history = after.history;
        await save(fromHistory(history));
        lastSaved = history.length;
        log(`${Math.ceil(history.length / 2)}. Jev: ${move.san} | ${decision.elapsedMs} ms | confidence ${decision.confidence}`);
        break;
      }
      if (Date.now() > confirmBy) throw new Error('Click was not confirmed. Stopped without retrying the move.');
      await sleep(75);
    }
  }
}
