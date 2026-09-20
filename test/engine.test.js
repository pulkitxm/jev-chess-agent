import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { analyzePosition, completeIteration, parseEngineInfo } from '../src/engine.js';
import { fromHistory } from '../src/chess.js';
import { chooseMove } from '../src/jev.js';

function fixture(history, { hang = false } = {}) {
  const legal = fromHistory(history).moves({ verbose: true }).map(move => `${move.from}${move.to}${move.promotion || ''}`);
  const commands = [];
  let killed = false;
  const spawnImpl = () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new Writable({ write(chunk, encoding, callback) {
      for (const command of chunk.toString().trim().split('\n')) {
        commands.push(command);
        queueMicrotask(() => {
          if (killed) return;
          if (command === 'uci') child.stdout.write('id name Stockfish fixture\nuciok\n');
          if (command === 'isready') child.stdout.write('readyok\n');
          if (command.startsWith('go ') && !hang) {
            legal.forEach((move, index) => child.stdout.write(`info depth 3 multipv ${index + 1} score cp ${30 - index} pv ${move}\n`));
            child.stdout.write(`bestmove ${legal[0]}\n`);
          }
        });
      }
      callback();
    } });
    child.kill = () => { killed = true; child.stdout.end(); child.stderr.end(); queueMicrotask(() => child.emit('close', 0)); };
    return child;
  };
  return { spawnImpl, commands, legal, killed: () => killed };
}

test('parses exact engine scores and rejects bounds or malformed variations', () => {
  const info = parseEngineInfo('info depth 14 multipv 2 score mate -3 nodes 50 pv e2e4 e7e5');
  assert.equal(info.score.type, 'mate');
  assert.equal(info.score.value, -3);
  assert.equal(info.rank, 2);
  assert.equal(parseEngineInfo('info depth 14 multipv 1 score cp 32 lowerbound pv e2e4'), null);
  assert.equal(parseEngineInfo('info depth 14 multipv 1 score cp 32 pv invalid'), null);
});

test('uses a complete iteration instead of mixing incomplete deeper scores', () => {
  const a = parseEngineInfo('info depth 3 multipv 1 score cp 30 pv e2e4');
  const b = parseEngineInfo('info depth 3 multipv 2 score cp 20 pv d2d4');
  const c = parseEngineInfo('info depth 4 multipv 1 score cp 35 pv d2d4');
  const iterations = new Map([[3, new Map([[1, a], [2, b]])], [4, new Map([[1, c]])]]);
  assert.equal(completeIteration(iterations, ['e2e4', 'd2d4']).depth, 3);
  assert.throws(() => completeIteration(iterations, ['e2e4', 'g1f3']));
});

test('sends complete move history, analyzes all choices, and closes its process', async () => {
  const history = ['e4', 'c5', 'Nc3'];
  const f = fixture(history);
  const result = await analyzePosition(history, { spawnImpl: f.spawnImpl, movetime: 50 });
  assert.ok(f.commands.includes('position startpos moves e2e4 c7c5 b1c3'));
  assert.ok(f.commands.includes(`setoption name MultiPV value ${f.legal.length}`));
  assert.equal(result.lines.length, f.legal.length);
  assert.equal(result.engine, 'Stockfish fixture');
  assert.ok(result.lines.every(line => line.san.length === 1));
  assert.equal(f.killed(), true);
});

test('abort, timeout, and missing executable fail without an alternative move', async () => {
  const timed = fixture([], { hang: true });
  await assert.rejects(analyzePosition([], { spawnImpl: timed.spawnImpl, movetime: 50, timeoutMs: 10 }), /timed out/);
  assert.equal(timed.killed(), true);
  const f = fixture([], { hang: true });
  const controller = new AbortController();
  const pending = analyzePosition([], { spawnImpl: f.spawnImpl, signal: controller.signal });
  controller.abort(new Error('Stop analysis'));
  await assert.rejects(pending, /Stop analysis/);
  assert.equal(f.killed(), true);
  await assert.rejects(analyzePosition([], { executable: '/missing-stockfish-test-executable' }), /Cannot run Stockfish/);
});

test('engine advice retains every legal option and never overrides the final Jev answer', async () => {
  const analysis = await analyzePosition([], { spawnImpl: fixture([]).spawnImpl, movetime: 50 });
  const requests = [];
  const result = await chooseMove([], {
    apiKey: 'test', strategy: 'engine-review', analyzeImpl: async () => analysis,
    fetchImpl: async (url, options) => {
      requests.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ answers: { move: { choice: 'f2f3', confidence: 0.2 } } }) };
    }
  });
  assert.equal(requests.length, 2);
  assert.equal(result.move.uci, 'f2f3');
  assert.equal(result.engineAdvice.engine, 'Stockfish fixture');
  assert.equal(result.move.tactics, undefined);
  assert.ok(Object.values(result.timings).every(value => Number.isFinite(value) && value >= 0));
  assert.equal(Object.values(result.timings).reduce((sum, value) => sum + value, 0), result.elapsedMs);
  assert.equal(result.timings.modelMs, result.decisionRounds.reduce((sum, round) => sum + round.elapsedMs, 0));
  for (const request of requests) assert.equal(Object.keys(request.questions.move.criteria).length, 20);
  assert.equal(requests[1].state.previousChoice, 'f2f3');
});

test('failed engine analysis stops before asking Jev or silently falling back', async () => {
  let called = false;
  await assert.rejects(chooseMove([], { apiKey: 'test', strategy: 'engine-review', analyzeImpl: async () => { throw new Error('Engine failed'); }, fetchImpl: async () => { called = true; } }), /Engine failed/);
  assert.equal(called, false);
});
