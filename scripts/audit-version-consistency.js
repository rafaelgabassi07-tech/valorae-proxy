import fs from 'node:fs';
import path from 'node:path';
import pkg from '../package.json' with { type: 'json' };

const root = process.cwd();
const version = String(pkg.version || '');
const expectedPrefix = `${version}-`;
const failures = [];

const engineFile = fs.readFileSync(path.join(root, 'lib/Valorae-engine.js'), 'utf8');
if (!engineFile.includes(expectedPrefix)) failures.push(`Valorae-engine.js não contém prefixo ${expectedPrefix}`);

for (const file of ['README.md', 'public/index.html', 'docs/CHANGELOG.md']) {
  const content = fs.readFileSync(path.join(root, file), 'utf8');
  if (!content.includes(version)) failures.push(`${file} não referencia ${version}`);
}

const pkgText = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
if (!pkgText.includes(`"version": "${version}"`)) failures.push('package.json não contém versão coerente.');

if (failures.length) {
  console.error('Version consistency audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Version consistency OK: ${version}.`);
