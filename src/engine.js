import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { Chess } from 'chess.js';
import { fromHistory } from './chess.js';

export function parseEngineInfo(line) {
  if (!line.startsWith('info ') || /\b(?:upperbound|lowerbound)\b/.test(line)) return null;
  const depth = line.match(/\bdepth (\d+)/);
  const rank = line.match(/\bmultipv (\d+)/);
  const score = line.match(/\bscore (cp|mate) (-?\d+)/);
  const pv = line.match(/\bpv (.+)$/);
  if (!depth || !rank || !score || !pv) return null;
  const variation = pv[1].trim().split(/\s+/);
  if (!variation.every(move => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))) return null;
  return { depth: Number(depth[1]), rank: Number(rank[1]), score: { type: score[1], value: Number(score[2]) }, move: variation[0], variation };
}

export function completeIteration(iterations, legal) {
  for (const [depth, ranks] of [...iterations].sort((a, b) => b[0] - a[0])) {
    const lines = [...ranks.values()].sort((a, b) => a.rank - b.rank);
    if (lines.length !== legal.length || new Set(lines.map(line => line.move)).size !== legal.length) continue;
    if (!lines.every((line, index) => line.rank === index + 1 && legal.includes(line.move))) continue;
    return { depth, lines };
  }
  throw new Error('Stockfish did not return a complete evaluation of every legal move');
}

export async function analyzePosition(history, { signal, executable = process.env.STOCKFISH_PATH || 'stockfish', movetime = Number(process.env.STOCKFISH_MOVETIME_MS || 1000), depth = 18, timeoutMs = movetime + 10000, spawnImpl = spawn } = {}) {
  if (!Number.isInteger(movetime) || movetime < 50 || movetime > 60000 || !Number.isInteger(depth) || depth < 1 || depth > 30 || !Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid Stockfish search limits');
  signal?.throwIfAborted();
  const chess = fromHistory(history);
  if (chess.isGameOver()) throw new Error('The game is over');
  const uci = move => `${move.from}${move.to}${move.promotion || ''}`;
  const legal = chess.moves({ verbose: true }).map(uci);
  const played = chess.history({ verbose: true }).map(uci);
  const started = Date.now();
  const result = await new Promise((resolve, reject) => {
    const child = spawnImpl(executable, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    const reader = createInterface({ input: child.stdout });
    const iterations = new Map();
    let engine = null;
    let settled = false;
    let searching = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reader.close();
      child.kill();
      if (error) reject(error);
      else resolve(value);
    };
    const abort = () => finish(signal.reason || new Error('Engine analysis aborted'));
    const timer = setTimeout(() => finish(new Error('Stockfish analysis timed out')), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    child.once('error', error => finish(new Error(`Cannot run Stockfish: ${error.message}`)));
    child.once('close', () => finish(new Error('Stockfish exited before completing analysis')));
    child.stdin.on('error', error => finish(error));
    child.stderr.resume();
    reader.on('line', line => {
      if (settled) return;
      try {
        if (line.startsWith('id name ')) engine = line.slice(8);
        if (line === 'uciok') {
          child.stdin.write(`setoption name Threads value 2\nsetoption name Hash value 128\nsetoption name MultiPV value ${legal.length}\nisready\n`);
        } else if (line === 'readyok' && !searching) {
          searching = true;
          child.stdin.write(`position startpos${played.length ? ` moves ${played.join(' ')}` : ''}\ngo depth ${depth} movetime ${movetime}\n`);
        } else if (line.startsWith('bestmove ')) {
          if (!engine) throw new Error('Stockfish did not identify itself');
          const bestmove = line.split(/\s+/)[1];
          if (!legal.includes(bestmove)) throw new Error('Stockfish returned an illegal best move');
          finish(null, { engine, bestmove, ...completeIteration(iterations, legal) });
        } else {
          const info = parseEngineInfo(line);
          if (info) {
            if (!iterations.has(info.depth)) iterations.set(info.depth, new Map());
            iterations.get(info.depth).set(info.rank, info);
          }
        }
      } catch (error) { finish(error); }
    });
    child.stdin.write('uci\n');
    if (signal?.aborted) abort();
  });
  for (const line of result.lines) {
    const replay = new Chess(chess.fen());
    line.san = line.variation.slice(0, 8).map(move => replay.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] }).san);
  }
  return { ...result, movetime, requestedDepth: depth, elapsedMs: Date.now() - started };
}
