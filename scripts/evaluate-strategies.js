import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { chooseMove, makeRequest } from '../src/jev.js';

const { values } = parseArgs({ options: { limit: { type: 'string', default: '12' }, strategies: { type: 'string', default: 'development,compact' } } });
const limit = Number(values.limit);
if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Limit must be 1 to 100');
const strategies = values.strategies.split(',');
const files = [];
async function scan(path) {
  for (const item of await readdir(path, { withFileTypes: true }).catch(() => [])) {
    const full = join(path, item.name);
    if (item.isDirectory()) await scan(full);
    else if (item.name === 'decisions.jsonl') files.push(full);
  }
}
await scan('data/runs');
await scan('data/attempts');
const positions = new Map();
for (const file of files.sort()) {
  for (const line of (await readFile(file, 'utf8')).trim().split('\n').filter(Boolean)) {
    const row = JSON.parse(line);
    const t = row.move?.tactics;
    if (!t || !(t.worstMaterialChangeInListedExchanges < 0 || t.opponentCanCheckmateImmediately)) continue;
    const id = createHash('sha256').update(JSON.stringify(row.history)).digest('hex');
    positions.set(id, { id, history: row.history });
  }
}
const selected = [];
for (const position of [...positions.values()].sort((a, b) => a.id.localeCompare(b.id))) {
  const { moves } = makeRequest(position.history, undefined, { extendChecks: true });
  if (moves.some(move => move.tactics.worstMaterialChangeInListedExchanges >= 0 && !move.tactics.opponentCanCheckmateImmediately && !move.tactics.opponentCanForceMateAfterCheck)) selected.push(position);
  if (selected.length === limit) break;
}
if (!selected.length) throw new Error('No saved avoidable tactical-error positions found');
const directory = resolve(`data/evaluations/${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(directory, { recursive: true, mode: 0o700 });
const results = [];
for (const position of selected) {
  for (const strategy of strategies) {
    const decision = await chooseMove(position.history, { apiKey: process.env.TYPESAFE_API_KEY, strategy });
    const t = decision.move.tactics;
    const avoidedDetectedLoss = t.worstMaterialChangeInListedExchanges >= 0 && !t.opponentCanCheckmateImmediately && !t.opponentCanForceMateAfterCheck;
    results.push({ ...position, strategy, avoidedDetectedLoss, decision });
    await writeFile(join(directory, 'results.json'), JSON.stringify(results, null, 2), { mode: 0o600 });
    console.log(`${position.id.slice(0, 8)} ${strategy}: ${decision.move.notation}, detected loss avoided: ${avoidedDetectedLoss}, ${decision.elapsedMs}ms`);
  }
}
const summary = strategies.map(strategy => {
  const rows = results.filter(row => row.strategy === strategy);
  return { strategy, positions: rows.length, avoidedDetectedLoss: rows.filter(row => row.avoidedDetectedLoss).length, averageMs: Math.round(rows.reduce((sum, row) => sum + row.decision.elapsedMs, 0) / rows.length) };
});
await writeFile(join(directory, 'summary.json'), JSON.stringify({ limitation: 'Selected historical blunders with a locally detected safer alternative. Not a held-out strength or rating benchmark. No engine evaluations or win-rate claims.', summary }, null, 2));
console.log(JSON.stringify(summary));
console.log(directory);
