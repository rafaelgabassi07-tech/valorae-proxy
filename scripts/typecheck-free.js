import fs from 'node:fs';
import path from 'node:path';
import pkg from '../package.json' with { type: 'json' };

const failures = [];
function read(file) { return fs.readFileSync(file, 'utf8'); }
function assert(cond, msg) { if (!cond) failures.push(msg); }
function exists(file) { return fs.existsSync(file); }

assert(exists('lib/Valorae-engine.d.ts'), 'lib/Valorae-engine.d.ts ausente.');
assert(exists('lib/engine/Valorae-engine-types.ts'), 'lib/engine/Valorae-engine-types.ts ausente.');
assert(exists('public/sdk/typescript/valorae-client.ts'), 'SDK TypeScript ausente.');

if (exists('lib/Valorae-engine.d.ts')) {
  const dts = read('lib/Valorae-engine.d.ts');
  assert(dts.includes("./engine/Valorae-engine-types.js"), 'Valorae-engine.d.ts deve importar tipos com extensão .js para NodeNext.');
  for (const name of ['ValoraeEngine','canonicalizeTicker','inferAssetType','validarTicker','VALORAE_ENGINE_VERSION']) {
    assert(dts.includes(name), `Valorae-engine.d.ts não exporta ${name}.`);
  }
}

if (exists('lib/engine/Valorae-engine-types.ts')) {
  const types = read('lib/engine/Valorae-engine-types.ts');
  for (const name of ['ValoraeAssetPayload','ValoraeFetchOptions','ValoraeFinancialField','ValoraeAssetType']) {
    assert(types.includes(name), `Tipos do engine não declaram ${name}.`);
  }
  assert(types.includes('instant') || read('lib/performance/profile.js').includes('instant'), 'profile=instant precisa estar contemplado nos tipos ou perfis.');
}

if (exists('public/sdk/typescript/valorae-client.ts')) {
  const sdk = read('public/sdk/typescript/valorae-client.ts');
  for (const name of ['EnvelopeV2','ValoraeAssetPayload','ValoraeClient','portfolioAnalyze','cacheStats','ready','manifest','env','schema','sourceStatus']) {
    assert(sdk.includes(name), `SDK TypeScript não contém ${name}.`);
  }
  const forbiddenRuntimeImports = /from\s+['"](?!\.\/|\.\.\/)/.test(sdk);
  assert(!forbiddenRuntimeImports, 'SDK TypeScript não deve importar pacotes externos.');
}

const pkgText = JSON.stringify(pkg);
assert(!pkgText.includes('tsc --noEmit'), 'typecheck não deve depender de tsc sem declarar TypeScript.');
assert(!pkg.devDependencies || Object.keys(pkg.devDependencies).length === 0, 'Build free-only não deve exigir devDependencies para deploy.');

if (failures.length) {
  console.error('Free TypeScript/SDK contract check failed:');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log('TypeScript/SDK contract check OK: sem dependência externa de tsc.');
