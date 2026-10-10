// Performance budget (docs/backend/08 §8): first-load JS < 150 KB gz, engine not included in the bundle.
import { gzipSync } from 'node:zlib';
import { readdirSync, readFileSync, statSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const first = [...html.matchAll(/(?:src|href)="[^"]*?(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
let total = 0;
for (const f of new Set(first)) total += gzipSync(readFileSync(`dist/${f}`)).length;
const kb = total / 1024;
let all = 0;
for (const f of readdirSync('dist/assets').filter((x) => x.endsWith('.js'))) all += gzipSync(readFileSync(`dist/assets/${f}`)).length;
console.log(`first-load JS (gz): ${kb.toFixed(1)} KB (${first.length} files); all JS: ${(all / 1024).toFixed(1)} KB`);
const engine = readdirSync('dist/engine').reduce((s, f) => s + statSync(`dist/engine/${f}`).size, 0) / 1048576;
console.log(`engine files: ${engine.toFixed(1)} MB (loaded lazily, not part of the bundle)`);
if (kb > 150) {
  console.error('first-load JS budget exceeded (150 KB gz)');
  process.exit(1);
}
