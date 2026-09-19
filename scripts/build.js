import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';

await mkdir('dist/extension', { recursive: true });
await build({ entryPoints: ['extension/background.js', 'extension/content.js', 'extension/popup.js'], bundle: true, outdir: 'dist/extension', format: 'esm', target: 'chrome120', minify: true, legalComments: 'inline' });
for (const file of ['manifest.json', 'popup.html']) await copyFile(`extension/${file}`, `dist/extension/${file}`);
console.log('Extension ready in dist/extension');
await copyFile('node_modules/chess.js/LICENSE', 'dist/extension/CHESS-LICENSE');
