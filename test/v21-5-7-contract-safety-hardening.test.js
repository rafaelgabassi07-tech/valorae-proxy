import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyPayloadView, resolvePayloadView } from '../lib/quality/views.js';
import { resolvePerformanceOptions } from '../lib/performance/profile.js';
import { compareAssets } from '../lib/market/compare.js';
import { sendJson } from '../lib/performance/http.js';

function mockRes() {
  return {
    statusCode: 200,
    body: '',
    headers: {},
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    getHeader(k) { return this.headers[String(k).toLowerCase()]; },
    removeHeader(k) { delete this.headers[String(k).toLowerCase()]; },
    status(c) { this.statusCode = c; return this; },
    send(b) { this.body = b; return this; },
    end(b = '') { this.body = b; return this; },
  };
}

// Aliases públicos documentados agora são funcionais.
assert.deepEqual(resolvePayloadView('quote').resolved, 'compact');
assert.deepEqual(resolvePayloadView('wallet').resolved, 'standard');
assert.deepEqual(resolvePayloadView('analysis').resolved, 'full');
const walletPayload = applyPayloadView({ ticker: 'GARE11', type: 'FII', results: { dividendos: { dividendYield: '10%' }, informacoesFundo: { segmento: 'Logística' } } }, 'wallet');
assert.equal(walletPayload.view, 'standard');
assert.equal(walletPayload.requestedView, 'wallet');
assert.deepEqual(resolvePerformanceOptions({ profile: 'quote' }).performanceProfile, 'fast');
assert.deepEqual(resolvePerformanceOptions({ profile: 'wallet' }).performanceProfile, 'portfolio');
assert.deepEqual(resolvePerformanceOptions({ profile: 'analysis' }).performanceProfile, 'deep');

// Compare deve priorizar normalized.value sobre textos brutos em results.
const cmp = compareAssets([
  { ticker: 'AAA3', type: 'ACAO', status: 'OK', quality: { score: 80 }, valoraeScore: { value: 70 }, normalized: { dividendYield: { value: 12 }, pvp: { value: 0.8 }, roe: { value: 18 } }, results: { dividendYield: '1%', pvp: '9,9', roe: '1%' } },
  { ticker: 'BBB3', type: 'ACAO', status: 'OK', quality: { score: 80 }, valoraeScore: { value: 70 }, normalized: { dividendYield: { value: 5 }, pvp: { value: 1.4 }, roe: { value: 8 } }, results: { dividendYield: '30%', pvp: '0,1', roe: '30%' } },
]);
assert.equal(cmp.rankings.dividendYield[0].ticker, 'AAA3');
assert.equal(cmp.rankings.pvp[0].ticker, 'AAA3');

// Parser não deve usar Function/eval; free-only audit cobre também, este teste é direto.
const engineSource = fs.readFileSync('lib/Valorae-engine.js', 'utf8');
assert.equal(/\bFunction\s*\(/.test(engineSource), false);
assert.equal(/\beval\s*\(/.test(engineSource), false);
assert.ok(engineSource.includes('normalizeJsLikeJson'));

// OpenAPI deve usar components/schemas, não #/schemas legado.
const openapi = fs.readFileSync('routes/openapi.js', 'utf8');
assert.ok(openapi.includes('components:'));
assert.ok(openapi.includes('#/components/schemas/Position'));
assert.equal(openapi.includes('#/schemas/'), false);

// ETag deve ignorar campos voláteis como requestId/generatedAt.
const a = mockRes();
sendJson({ method: 'GET', query: {}, headers: {} }, a, { version: 'x', requestId: 'one', meta: { generatedAt: '2026-01-01T00:00:00Z' }, data: { ok: true } });
const b = mockRes();
sendJson({ method: 'GET', query: {}, headers: {} }, b, { version: 'x', requestId: 'two', meta: { generatedAt: '2026-02-01T00:00:00Z' }, data: { ok: true } });
assert.equal(a.headers.etag, b.headers.etag);

// TypeScript SDK e declaração NodeNext devem estar alinhados.
const dts = fs.readFileSync('lib/Valorae-engine.d.ts', 'utf8');
assert.ok(dts.includes("./engine/Valorae-engine-types.js"));
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert.equal(pkg.scripts.typecheck, 'node scripts/typecheck-free.js');
assert.equal(pkg.scripts.verify, 'node scripts/verify-release.js');
assert.ok(fs.readFileSync('scripts/verify-release.js', 'utf8').includes("['npm', ['run', 'typecheck']]"));

console.log('v21.5.13 contract safety hardening tests OK.');
