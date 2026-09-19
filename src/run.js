import { chromium } from 'playwright';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chooseMove } from './jev.js';
import { gameResult } from './chess.js';
import { autoplay } from './autoplay.js';
import { browserGame, startMaximum } from './browser-game.js';

const { values } = parseArgs({ options: {
  demo: { type: 'boolean', default: false },
  headless: { type: 'boolean', default: false },
  'max-moves': { type: 'string' },
  seconds: { type: 'string' },
  output: { type: 'string' }
} });
const maxMoves = Number(values['max-moves'] || (values.demo ? 8 : 150));
const maxSeconds = Number(values.seconds || (values.demo ? 120 : 900));
if (!Number.isInteger(maxMoves) || maxMoves < 1 || maxMoves > 200 || !Number.isFinite(maxSeconds) || maxSeconds < 1) throw new Error('Invalid move or time limit');
if (!process.env.TYPESAFE_API_KEY) throw new Error('Set TYPESAFE_API_KEY in .env');
const directory = resolve(values.output || `data/runs/${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(directory, { recursive: true, mode: 0o700 });
const controller = new AbortController();
const stop = () => controller.abort(new Error('Stopped by user'));
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
const profile = resolve('data/runner-profile');
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chrome', headless: values.headless,
  viewport: { width: 1280, height: 900 },
  recordVideo: { dir: directory, size: { width: 1280, height: 900 } }
});
const page = context.pages()[0] || await context.newPage();
page.setDefaultTimeout(5000);
const video = page.video();
const save = async chess => {
  chess.header('Event', 'Jev versus Maximum', 'Site', 'Chess.com', 'White', 'Jev', 'Black', 'Maximum', 'Result', gameResult(chess));
  await writeFile(resolve(directory, 'game.pgn'), chess.pgn(), { mode: 0o600 });
};
let outcome;
const started = Date.now();
try {
  console.log('Opening a dedicated Chrome profile. Jev selects moves; the program runs the game and records video.');
  await startMaximum(page, controller.signal);
  const game = browserGame(page);
  console.log('Maximum game started. Press Ctrl+C to stop and save the recording.');
  outcome = await autoplay({ ...game, save, signal: controller.signal, maxMoves, maxSeconds,
    choose: async history => {
      const decision = await chooseMove(history, { apiKey: process.env.TYPESAFE_API_KEY, model: process.env.TYPESAFE_MODEL || 'jev-1.13.0', signal: controller.signal });
      await appendFile(resolve(directory, 'decisions.jsonl'), JSON.stringify({ at: new Date().toISOString(), history, ...decision }) + '\n', { mode: 0o600 });
      return decision;
    }
  });
  console.log(`${outcome.reason}: ${outcome.result}. ${outcome.decisions} decisions.`);
  await page.waitForTimeout(1500);
} catch (error) {
  outcome = { error: error.message };
  console.error(error.message);
  if (!controller.signal.aborted) process.exitCode = 1;
} finally {
  await writeFile(resolve(directory, 'summary.json'), JSON.stringify({ ...outcome, elapsedSeconds: (Date.now() - started) / 1000 }, null, 2), { mode: 0o600 });
  await context.close();
  if (video) { await video.saveAs(resolve(directory, 'demo.webm')); await video.delete(); }
  console.log(`Recording and game: ${directory}`);
}
