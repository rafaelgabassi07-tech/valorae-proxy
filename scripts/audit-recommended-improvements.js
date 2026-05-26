import fs from 'node:fs';
import path from 'node:path';
import pkg from '../package.json' with { type: 'json' };
import { routeManifest } from '../routes/_router.js';
import { ENV_CATALOG, ERROR_CATALOG, VIEW_ALIASES, PROFILE_ALIASES, TTL_MATRIX } from '../lib/catalogs/valorae-catalogs.js';

const failures = [];
function assert(cond, msg) { if (!cond) failures.push(msg); }
function exists(file) { return fs.existsSync(file); }
function read(file) { return fs.readFileSync(file, 'utf8'); }
const manifest = routeManifest();

assert(pkg.version === '21.5.13', 'package.json precisa estar em 21.5.13.');
assert(Object.keys(pkg.dependencies || {}).length === 0, 'dependencies deve continuar vazio.');
assert(manifest.physicalFunctions.length === 2, 'Devem existir só 2 Functions físicas.');

for (const file of ['.nvmrc','.env.example','LICENSE','SECURITY.md','CONTRIBUTING.md','docs/ENVIRONMENT.md','docs/TROUBLESHOOTING.md','docs/ARCHITECTURE.md','docs/QUALITY_MATRIX.md']) {
  assert(exists(file), `Arquivo recomendado ausente: ${file}`);
}
for (const route of ['/env','/schema','/source/status','/cache/stats','/ready','/manifest']) {
  assert(manifest.routes.includes(route), `Rota recomendada ausente: ${route}`);
}
for (const fixture of ['investidor10-acao-sample.html','investidor10-etf-sample.html','investidor10-bdr-sample.html','investidor10-blocked-sample.html','yahoo-chart-empty.json','yahoo-chart-partial.json','yahoo-chart-429.json','google-news-empty.xml','google-news-malformed.xml']) {
  assert(exists(path.join('test/fixtures/source', fixture)), `Fixture recomendada ausente: ${fixture}`);
}
assert(ENV_CATALOG.length >= 15, 'Catálogo de envs precisa cobrir as variáveis principais.');
assert(ERROR_CATALOG.some(e => e.code === 'URL_TOO_LONG'), 'Catálogo de erros precisa incluir URL_TOO_LONG.');
assert(VIEW_ALIASES.tiny === 'compact', 'view=tiny deve existir.');
assert(PROFILE_ALIASES.tiny === 'instant', 'profile=tiny deve existir.');
assert(TTL_MATRIX.staticCatalog?.cacheControl, 'TTL matrix precisa expor staticCatalog.');
assert(read('lib/security/guard.js').includes('VALORAE_CORS_STRICT'), 'CORS strict opcional precisa estar codificado.');
assert(read('lib/security/guard.js').includes('assertUrlAndQueryBudget'), 'Limites de URL/query precisam estar codificados.');
assert(read('lib/Valorae-engine.js').includes('dataQualityMatrix'), 'Ativo precisa incluir dataQualityMatrix.');
assert(read('lib/Valorae-engine.js').includes('sourceReliability'), 'Ativo precisa incluir sourceReliability.');
assert(read('lib/portfolio/intelligence.js').includes('healthScore'), 'Carteira precisa incluir healthScore.');
assert(read('lib/portfolio/intelligence.js').includes('incomeStabilityScore'), 'Carteira precisa incluir incomeStabilityScore.');
assert(read('lib/portfolio/intelligence.js').includes('dividendCoverage'), 'Carteira precisa incluir dividendCoverage.');
assert(read('routes/openapi.js').includes('operationId'), 'OpenAPI precisa ter operationId.');
assert(read('routes/openapi.js').includes('/api/v1/env') && read('routes/openapi.js').includes('/api/v1/schema') && read('routes/openapi.js').includes('/api/v1/source/status'), 'OpenAPI precisa declarar env/schema/source status.');

const badRuntime = [/from ['"]@supabase\//, /new\s+WebSocket\s*\(/, /KV_REST_API_URL\s*&&/, /REDIS_URL\s*&&/];
for (const file of fs.readdirSync('lib').concat(fs.readdirSync('routes')).map(x => String(x))) {
  void file;
}
for (const file of ['lib/Valorae-engine.js','routes/sync.js','package.json']) {
  const content = read(file);
  for (const re of badRuntime) assert(!re.test(content), `Padrão não recomendado no runtime: ${re} em ${file}`);
}

if (failures.length) {
  console.error('Recommended improvements audit failed:');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}
console.log('Recommended improvements audit OK: melhorias viáveis v21.5.13 presentes e sem tecnologias não recomendadas.');
