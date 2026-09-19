import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Chess } from 'chess.js';

const { values } = parseArgs({ options: { games: { type: 'string', default: '3' }, strategy: { type: 'string', default: 'semantic' } } });
const games = Number(values.games);
if (!Number.isInteger(games) || games < 1 || games > 100) throw new Error('Choose between 1 and 100 games');
if (!['original', 'semantic', 'foresight'].includes(values.strategy)) throw new Error('Unknown strategy');
const directory = resolve(`data/attempts/${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(directory, { recursive: true });
const results = [];
for (let attempt = 1; attempt <= games; attempt++) {
  const output = resolve(directory, String(attempt));
  console.log(`Full match ${attempt} of ${games}. Jev selects every move.`);
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--env-file-if-exists=.env', 'src/run.js', '--4k', '--strategy', values.strategy, '--output', output], { stdio: 'inherit' });
    child.once('error', reject);
    child.once('close', resolve);
  });
  if (code !== 0) throw new Error(`Match stopped with exit code ${code}; no automatic retry after an error`);
  const summary = JSON.parse(await readFile(resolve(output, 'summary.json'), 'utf8'));
  const chess = new Chess();
  chess.loadPgn(await readFile(resolve(output, 'game.pgn'), 'utf8'));
  const decisions = (await readFile(resolve(output, 'decisions.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  const history = chess.history();
  const verifiedMoves = decisions.length === Math.ceil(history.length / 2) && decisions.every((decision, index) => decision.move.notation === history[index * 2] && decision.decisionRounds.at(-1).choice === decision.move.uci);
  if (!summary.complete || !verifiedMoves || !chess.isGameOver()) throw new Error('Incomplete match or move audit failed');
  const won = summary.result === '1-0' && chess.isCheckmate() && chess.turn() === 'b';
  results.push({ attempt, output, result: summary.result, won, verifiedMoves, plies: history.length });
  await writeFile(resolve(directory, 'results.json'), JSON.stringify(results, null, 2));
  if (won) {
    console.log(`Verified Jev win. Complete recording: ${resolve(output, 'match-4k.mp4')}`);
    process.exit(0);
  }
}
console.log(`No win in ${games} completed matches. Results: ${directory}`);
process.exitCode = 2;
