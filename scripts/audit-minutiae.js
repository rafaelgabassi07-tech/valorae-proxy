import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { routeManifest, _test as routerTest } from '../routes/_router.js';
import { getInput, isReadLikeMethod } from '../lib/http/route.js';
import pkg from '../package.json' with { type: 'json' };

const failures = [];
const warnings = [];
const root = process.cwd();
function assert(cond, msg) { if (!cond) failures.push(msg); }
function warn(cond, msg) { if (!cond) warnings.push(msg); }
function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function exists(file) { return fs.existsSync(path.join(root, file)); }

function walk(dir, predicate = () => true, out = []) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!['node_modules','.git','.vercel'].includes(e.name)) walk(rel, predicate, out);
    } else if (predicate(rel)) out.push(rel);
  }
  return out;
}

// 1) Runtime imports locais precisam existir.
const jsFiles = walk('.', rel => rel.endsWith('.js') && !rel.startsWith('test/') && !rel.startsWith('docs/'));
const importRe = /(?:import\s+(?:[^'";]+\s+from\s+)?|import\s*\(|export\s+[^'";]+\s+from\s+)['"](\.{1,2}\/[^'"]+)['"]/g;
for (const file of jsFiles) {
  const source = read(file);
  let match;
  while ((match = importRe.exec(source))) {
    const spec = match[1];
    if (spec.includes('${')) continue;
    const resolved = path.normalize(path.join(path.dirname(file), spec));
    const candidates = [resolved, `${resolved}.js`, `${resolved}.json`, `${resolved}.ts`, path.join(resolved, 'index.js')];
    if (!candidates.some(c => exists(c))) failures.push(`Import local não resolvido em ${file}: ${spec}`);
  }
}

// 2) Todas as rotas do manifesto precisam importar handler default.
const manifest = routeManifest();
const routeSource = read('routes/_router.js');
for (const route of manifest.routes) {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = routeSource.match(new RegExp(`${escaped}['"]:\\s*\\(\\) => import\\('([^']+)'\\)`));
  assert(Boolean(m), `Rota ${route} não tem import dinâmico rastreável.`);
  if (!m) continue;
  const file = m[1].replace(/^\.\//, 'routes/');
  assert(exists(file), `Arquivo de rota ausente: ${file}`);
  if (exists(file)) {
    const mod = await import(pathToFileURL(path.join(root, file)).href);
    assert(typeof mod.default === 'function', `Rota ${route} não exporta default function em ${file}.`);
  }
}

// 3) HEAD deve ser read-like para preservar query em rotas GET.
assert(isReadLikeMethod('GET') && isReadLikeMethod('HEAD'), 'GET e HEAD devem ser métodos de leitura.');
assert(getInput({ method: 'HEAD', query: { ticker: 'PETR4' }, body: { ticker: 'ERR' } }).ticker === 'PETR4', 'HEAD deve usar req.query, não req.body.');

// 4) Normalização de path só remove /api exato ou /api/; não /apiary.
assert(routerTest.stripApiPrefix('/api') === '/', 'stripApiPrefix(/api) deve retornar /.');
assert(routerTest.stripApiPrefix('/api/v1/ready') === '/v1/ready', 'stripApiPrefix deve remover /api/ em rotas reais.');
assert(routerTest.stripApiPrefix('/apiary/ready') === '/apiary/ready', 'stripApiPrefix não deve alterar caminhos parecidos com /apiary.');

// 5) Contrato de lançamento público.
assert(pkg.version === '21.5.13', 'package.json deve estar na versão 21.5.13.');
assert(read('lib/Valorae-engine.js').includes('21.5.13-mature-final-release-free'), 'Engine deve expor versão 21.5.13-mature-final-release-free.');
assert(read('public/index.html').includes('21.5.13'), 'public/index.html deve exibir versão 21.5.13.');
assert(read('routes/ready.js').includes("const version = '21.5.13'"), 'ready.js deve declarar release 21.5.13.');
assert(read('routes/manifest.js').includes("release: '21.5.13'"), 'manifest.js deve declarar release 21.5.13.');

// 6) Guardrails de deploy simples.
assert(Object.keys(pkg.dependencies || {}).length === 0, 'dependencies precisa continuar vazio.');
assert(!pkg.devDependencies || Object.keys(pkg.devDependencies).length === 0, 'devDependencies precisa continuar vazio.');
assert(manifest.physicalFunctions.length === 2, 'manifest deve manter exatamente duas Functions físicas.');
assert(exists('.vercelignore') && read('.vercelignore').includes('test') && read('.vercelignore').includes('docs/audits'), '.vercelignore deve excluir testes e auditorias históricas do deploy.');

// 7) Public SDK sanity.
assert(read('public/sdk/typescript/valorae-client.ts').includes('timeoutMs'), 'SDK TypeScript deve manter timeoutMs.');
assert(read('public/sdk/android-java/ValoraeClient.java').includes('setConnectTimeout'), 'SDK Java deve manter timeout HTTP.');

for (const w of warnings) console.warn(`Minutiae warning: ${w}`);
if (failures.length) {
  console.error('Final minutiae audit failed:');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log(`Final minutiae audit OK: ${jsFiles.length} JS runtime files, ${manifest.routes.length} rotas, HEAD/query e imports locais verificados.`);
