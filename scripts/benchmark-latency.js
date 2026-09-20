import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parseArgs } from 'node:util';
import { chooseMove } from '../src/jev.js';
import { analyzePosition } from '../src/engine.js';

const { values } = parseArgs({ options: { match: { type: 'string', multiple: true }, samples: { type: 'string', default: '6' }, movetime: { type: 'string', default: '1000' } } });
const samples = Number(values.samples);
const movetime = Number(values.movetime);
if (!values.match?.length || !Number.isInteger(samples) || samples < 2 || samples > 50 || !Number.isInteger(movetime) || movetime < 50 || movetime > 60000) throw new Error('Usage: node --env-file-if-exists=.env scripts/benchmark-latency.js --match <run-directory> [--match <run-directory>] [--samples 6] [--movetime 1000]');
if (!process.env.TYPESAFE_API_KEY) throw new Error('Set TYPESAFE_API_KEY in the local .env file');
const positions = new Map();
for (const directory of values.match) {
  const rows = (await readFile(join(directory, 'decisions.jsonl'), 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
  if (!rows.length || rows.some(row => row.strategy !== 'engine-review' || !row.engineAdvice?.lines?.length)) throw new Error('Benchmark inputs must contain assisted decision records');
  for (let index = 0; index < Math.min(samples, rows.length); index++) {
    const offset = rows.length === 1 ? 0 : Math.round(index * (rows.length - 1) / (Math.min(samples, rows.length) - 1));
    const original = rows[offset];
    const key = JSON.stringify(original.history);
    if (!positions.has(key)) positions.set(key, { source: directory, decisionIndex: offset, original });
  }
}
const directory = resolve(`data/latency/${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(directory, { recursive: true, mode: 0o700 });
const results = [];
for (const { source, decisionIndex, original } of positions.values()) {
  const decision = await chooseMove(original.history, { apiKey: process.env.TYPESAFE_API_KEY, model: original.model, strategy: 'engine-review', analyzeImpl: (history, options) => analyzePosition(history, { ...options, movetime }) });
  const referenceBest = original.engineAdvice.lines.find(line => line.rank === 1);
  const referenceSelected = original.engineAdvice.lines.find(line => line.move === decision.move.uci);
  if (!referenceSelected) throw new Error('Selected move missing from the saved reference analysis');
  const referenceCentipawnLoss = referenceBest.score.type === 'cp' && referenceSelected.score.type === 'cp' ? Math.max(0, referenceBest.score.value - referenceSelected.score.value) : null;
  const missesReferenceMate = referenceBest.score.type === 'mate' && referenceBest.score.value > 0 && !(referenceSelected.score.type === 'mate' && referenceSelected.score.value > 0);
  const allowsReferenceMate = referenceSelected.score.type === 'mate' && referenceSelected.score.value < 0 && !(referenceBest.score.type === 'mate' && referenceBest.score.value < 0);
  const followsRecommendation = decision.move.uci === decision.engineAdvice.lines.find(line => line.rank === 1).move;
  results.push({ source, decisionIndex, history: original.history, previousElapsedMs: original.elapsedMs, previousMovetime: original.engineAdvice.movetime, previousMove: original.move.uci, referenceBestScore: referenceBest.score, referenceSelectedScore: referenceSelected.score, referenceCentipawnLoss, missesReferenceMate, allowsReferenceMate, followsRecommendation, decision });
  await writeFile(join(directory, 'results.json'), JSON.stringify(results, null, 2), { mode: 0o600 });
  console.log(`${results.length}/${positions.size}: ${decision.move.notation}, ${decision.elapsedMs} ms, reference loss ${referenceCentipawnLoss ?? 'mate score'}, missed mate ${missesReferenceMate}`);
}
const average = select => Math.round(results.reduce((sum, row) => sum + select(row), 0) / results.length);
const summary = {
  positions: results.length,
  movetime,
  previousAverageMs: average(row => row.previousElapsedMs),
  averageMs: average(row => row.decision.elapsedMs),
  averageTimings: Object.fromEntries(['preparationMs', 'engineMs', 'modelMs', 'otherMs'].map(key => [key, average(row => row.decision.timings[key])])),
  followedRecommendation: results.filter(row => row.followsRecommendation).length,
  samePreviousMove: results.filter(row => row.previousMove === row.decision.move.uci).length,
  maximumReferenceCentipawnLoss: Math.max(0, ...results.map(row => row.referenceCentipawnLoss ?? 0)),
  missedReferenceMates: results.filter(row => row.missesReferenceMate).length,
  allowedReferenceMates: results.filter(row => row.allowsReferenceMate).length,
  limitation: 'Evenly sampled saved games with historical timing and engine evaluations as references. Not a controlled latency study, independent strength benchmark, or proof that shorter searches preserve playing strength.'
};
await writeFile(join(directory, 'summary.json'), JSON.stringify(summary, null, 2), { mode: 0o600 });
console.log(JSON.stringify(summary));
console.log(directory);
