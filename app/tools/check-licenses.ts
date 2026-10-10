// Licence ledger check (docs/backend/09 §5): every dependency must appear in LICENSES.md; content needs provenance.
import { readFileSync, readdirSync } from 'node:fs';

const ledger = readFileSync('../LICENSES.md', 'utf8').toLowerCase();
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const errors: string[] = [];
for (const name of [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]) {
  const short = name.replace(/^@[^/]+\//, '');
  if (!ledger.includes(name.toLowerCase()) && !ledger.includes(short.toLowerCase()) && !ledger.includes(`@${short.toLowerCase()}`)) errors.push(`dependency "${name}" is not in LICENSES.md`);
}
const dir = 'src/content/lessons';
for (const f of readdirSync(dir)) {
  const l = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  if (!l.provenance?.license) errors.push(`${f}: missing provenance.license`);
}
for (const f of ['rulesCheck', 'thinkAloud', 'repertoires', 'modelGames', 'misconceptions', 'habits', 'hints']) {
  const j = JSON.parse(readFileSync(`src/content/${f}.json`, 'utf8'));
  if (!j._provenance) errors.push(`content/${f}.json: missing _provenance`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('licences OK');
