import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { auditMatch } from '../src/match-audit.js';
import { engines } from '../src/browser-game.js';

const { values } = parseArgs({ options: { games: { type: 'string', default: '3' }, strategy: { type: 'string', default: 'semantic' }, opponent: { type: 'string', default: 'maximum' } } });
const games = Number(values.games);
if (!Number.isInteger(games) || games < 1 || games > 100) throw new Error('Choose between 1 and 100 games');
if (!['original', 'semantic', 'foresight', 'deliberate', 'development', 'compact', 'compact-review'].includes(values.strategy)) throw new Error('Unknown strategy');
if (!engines[values.opponent]) throw new Error('Choose maximum, beginner, or advanced');
const directory = resolve(`data/attempts/${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(directory, { recursive: true });
const results = [];
for (let attempt = 1; attempt <= games; attempt++) {
  const output = resolve(directory, String(attempt));
  console.log(`Full match ${attempt} of ${games} against ${engines[values.opponent].name}. Jev selects every move.`);
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--env-file-if-exists=.env', 'src/run.js', '--4k', '--opponent', values.opponent, '--strategy', values.strategy, '--output', output], { stdio: 'inherit' });
    child.once('error', reject);
    child.once('close', resolve);
  });
  if (code !== 0) throw new Error(`Match stopped with exit code ${code}; no automatic retry after an error`);
  const summary = JSON.parse(await readFile(resolve(output, 'summary.json'), 'utf8'));
  const pgn = await readFile(resolve(output, 'game.pgn'), 'utf8');
  const decisions = (await readFile(resolve(output, 'decisions.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  if (summary.opponent !== engines[values.opponent].name) throw new Error('Recorded opponent does not match the requested opponent');
  const audit = auditMatch({ pgn, decisions, summary });
  results.push({ attempt, output, opponent: summary.opponent, ...audit });
  await writeFile(resolve(directory, 'results.json'), JSON.stringify(results, null, 2));
  if (audit.won) {
    console.log(`Verified Jev win. Complete recording: ${resolve(output, 'match-4k.mp4')}`);
    process.exit(0);
  }
}
console.log(`No win in ${games} completed matches. Results: ${directory}`);
process.exitCode = 2;
