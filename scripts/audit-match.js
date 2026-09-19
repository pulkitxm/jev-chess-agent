import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { auditMatch } from '../src/match-audit.js';

const directory = process.argv[2];
if (!directory) throw new Error('Usage: node scripts/audit-match.js <match-directory>');
const [pgn, raw, summary] = await Promise.all([
  readFile(resolve(directory, 'game.pgn'), 'utf8'),
  readFile(resolve(directory, 'decisions.jsonl'), 'utf8'),
  readFile(resolve(directory, 'summary.json'), 'utf8').then(JSON.parse)
]);
const decisions = raw.trim().split('\n').filter(Boolean).map(JSON.parse);
console.log(JSON.stringify(auditMatch({ pgn, decisions, summary }), null, 2));
