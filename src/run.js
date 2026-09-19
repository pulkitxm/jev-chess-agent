import { chromium } from 'playwright';
import { mkdir, writeFile, appendFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chooseMove } from './jev.js';
import { gameResult } from './chess.js';
import { autoplay } from './autoplay.js';
import { browserGame, startEngine, engines } from './browser-game.js';
import { exportRecording } from './recording.js';
import { loadSession } from './session.js';

const { values } = parseArgs({ options: {
  demo: { type: 'boolean', default: false },
  opponent: { type: 'string', default: 'maximum' },
  '4k': { type: 'boolean', default: false },
  strategy: { type: 'string', default: 'original' },
  'max-moves': { type: 'string' },
  seconds: { type: 'string' },
  output: { type: 'string' }
} });
const maxMoves = values['max-moves'] === undefined ? (values.demo ? 8 : Infinity) : Number(values['max-moves']);
const maxSeconds = values.seconds === undefined ? (values.demo ? 120 : Infinity) : Number(values.seconds);
if ((maxMoves !== Infinity && !Number.isInteger(maxMoves)) || maxMoves < 1 || (maxMoves !== Infinity && maxMoves > 1000) || Number.isNaN(maxSeconds) || maxSeconds < 1) throw new Error('Invalid move or time limit');
if (!process.env.TYPESAFE_API_KEY) throw new Error('Set TYPESAFE_API_KEY in .env');
if (!['original', 'semantic', 'foresight', 'deliberate', 'development'].includes(values.strategy)) throw new Error('Unknown decision strategy');
const engine = engines[values.opponent];
if (!engine) throw new Error('Choose maximum or beginner');
const directory = resolve(values.output || `data/runs/${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(directory, { recursive: true, mode: 0o700 });
const controller = new AbortController();
const stop = () => controller.abort(new Error('Stopped by user'));
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
const profile = resolve('data/runner-profile');
const size = values['4k'] ? { width: 1920, height: 1080 } : { width: 1280, height: 900 };
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chrome', headless: false,
  viewport: size,
  deviceScaleFactor: 1,
  recordVideo: { dir: directory, size }
});
const page = context.pages()[0] || await context.newPage();
page.setDefaultTimeout(5000);
const video = page.video();
const videoPath = video ? await video.path() : null;
const save = async chess => {
  chess.header('Event', `Jev versus ${engine.name}`, 'Site', 'Chess.com', 'White', 'Jev', 'Black', engine.name, 'Result', gameResult(chess));
  await writeFile(resolve(directory, 'game.pgn'), chess.pgn(), { mode: 0o600 });
};
let outcome;
let firstMoveSeconds;
let gameReadySeconds;
const started = Date.now();
try {
  const cookieCount = await loadSession(context);
  if (cookieCount) console.log(`Loaded ${cookieCount} chess.com session cookies from the private local file.`);
  console.log('Opening a dedicated Chrome profile. Jev selects moves; the program runs the game and records video.');
  await startEngine(page, controller.signal, values.opponent);
  gameReadySeconds = (Date.now() - started) / 1000;
  const game = browserGame(page);
  console.log(`${engine.name} game started. Press Ctrl+C to stop and save the recording.`);
  outcome = await autoplay({ ...game, save, signal: controller.signal, maxMoves, maxSeconds,
    choose: async history => {
      const decision = await chooseMove(history, { apiKey: process.env.TYPESAFE_API_KEY, model: process.env.TYPESAFE_MODEL || 'jev-1.13.0', signal: controller.signal, strategy: values.strategy });
      firstMoveSeconds ??= (Date.now() - started) / 1000;
      await appendFile(resolve(directory, 'decisions.jsonl'), JSON.stringify({ at: new Date().toISOString(), history, ...decision }) + '\n', { mode: 0o600 });
      return decision;
    }
  });
  console.log(`${outcome.reason}: ${outcome.result}. ${outcome.decisions} decisions.`);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: resolve(directory, 'final-board.png') });
} catch (error) {
  outcome = { error: error.message };
  console.error(error.message);
  await page.screenshot({ path: resolve(directory, 'error-screen.png') }).catch(() => {});
  if (!controller.signal.aborted) process.exitCode = 1;
} finally {
  await writeFile(resolve(directory, 'summary.json'), JSON.stringify({ ...outcome, opponent: engine.name, headless: false, complete: outcome?.reason === 'Game finished' && outcome?.result !== '*', gameUrl: page.url(), gameReadySeconds, firstMoveSeconds, elapsedSeconds: (Date.now() - started) / 1000 }, null, 2), { mode: 0o600 });
  await context.close();
  if (videoPath) await rename(videoPath, resolve(directory, 'demo.webm'));
  if (videoPath && values['4k']) {
    console.log('Exporting continuous browser video to 3840 x 2160 MP4.');
    await exportRecording(resolve(directory, 'demo.webm'), resolve(directory, 'match-4k.mp4'), gameReadySeconds || 0);
    await writeFile(resolve(directory, 'recording.json'), JSON.stringify({ capture: 'continuous browser video', sourceWidth: size.width, sourceHeight: size.height, exportWidth: 3840, exportHeight: 2160, upscaled: true }, null, 2));
  }
  console.log(`Recording and game: ${directory}`);
}
