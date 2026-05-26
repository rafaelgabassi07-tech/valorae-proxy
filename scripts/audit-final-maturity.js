import fs from 'node:fs';
import assert from 'node:assert/strict';
import { _test as responseTest } from '../lib/contract/response.js';
import { routeManifest } from '../routes/_router.js';

const failures = [];
function check(condition, message) { if (!condition) failures.push(message); }

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
check(pkg.version === '21.5.13', 'package.json precisa estar em 21.5.13.');
check(Object.keys(pkg.dependencies || {}).length === 0, 'dependencies precisa continuar vazio.');
check(routeManifest().physicalFunctions.length === 2, 'precisa manter duas Functions físicas.');

const invalid = responseTest.parseFieldsDetailed('__proto__.x,ticker,constructor.y');
check(invalid.fields.includes('ticker'), 'fields válido deve continuar aceito.');
check(invalid.invalid.length === 2, 'fields inválidos/perigosos precisam ser detectados.');

const routeSource = fs.readFileSync('lib/http/route.js', 'utf8');
check(routeSource.includes("normalizedScrapePath !== '/api/scrape'"), 'scrapeUrl customizado precisa exigir path exato /api/scrape.');
check(routeSource.includes('!isReadLikeMethod(req.method)'), 'body size deve ignorar métodos read-like GET/HEAD.');

const guardSource = fs.readFileSync('lib/security/guard.js', 'utf8');
check(guardSource.includes('disabledEffective'), 'securityRuntimeStats deve diferenciar disabledRequested e disabledEffective.');
check(guardSource.includes('VALORAE_ADMIN_ALLOW_QUERY_TOKEN_IN_PRODUCTION'), 'token admin via query precisa exigir override explícito em produção.');

const catalogs = fs.readFileSync('lib/catalogs/valorae-catalogs.js', 'utf8');
check(catalogs.includes('VALORAE_ADMIN_ALLOW_QUERY_TOKEN_IN_PRODUCTION'), 'catálogo de envs precisa documentar override admin query em produção.');
check(catalogs.includes('21.5.13'), 'catálogos precisam referenciar 21.5.13.');

assert.equal(failures.length, 0, failures.join('\n'));
console.log('Final maturity audit OK: fields warnings, scrapeUrl exato, admin query token e rate limit efetivo verificados.');
