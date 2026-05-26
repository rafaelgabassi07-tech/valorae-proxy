import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ValoraeEngine } from '../lib/Valorae-engine.js';
import { analyzePortfolio } from '../lib/portfolio/analytics.js';
import { buildAssetDataQualityMatrix, schemaCatalog } from '../lib/quality/data-quality.js';
import { ENV_CATALOG, ERROR_CATALOG, VIEW_ALIASES, PROFILE_ALIASES, TTL_MATRIX } from '../lib/catalogs/valorae-catalogs.js';
import envHandler from '../routes/env.js';
import schemaHandler from '../routes/schema.js';
import sourceStatusHandler from '../routes/source/status.js';
import { beginRoute } from '../lib/http/route.js';

function makeRes() {
  const headers = {};
  return {
    statusCode: 200,
    body: '',
    headers,
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    getHeader(k) { return headers[String(k).toLowerCase()]; },
    removeHeader(k) { delete headers[String(k).toLowerCase()]; },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
    end(body = '') { this.body = body; return this; },
  };
}
async function call(handler, { method = 'GET', url = '/api/v1/test', query = {}, body = {}, headers = {} } = {}) {
  const req = { method, url, query, body, headers, socket: { remoteAddress: '127.0.0.1' } };
  const res = makeRes();
  await handler(req, res);
  let json = null;
  try { json = res.body ? JSON.parse(res.body) : null; } catch {}
  return { req, res, json };
}

assert.equal(ValoraeEngine.version, '21.5.13-mature-final-release-free');
assert.equal(VIEW_ALIASES.tiny, 'compact');
assert.equal(PROFILE_ALIASES.tiny, 'instant');
assert.ok(TTL_MATRIX.staticCatalog.cacheControl.includes('max-age'));
assert.ok(ENV_CATALOG.some(e => e.name === 'VALORAE_CORS_STRICT'));
assert.ok(ERROR_CATALOG.some(e => e.code === 'URL_TOO_LONG'));

const sampleAsset = {
  type: 'ACAO',
  results: { precoAtual: 'R$ 38,40', dividendYield: '12,30%', pl: '5,20', pvp: '1,15', roe: '22,10%' },
  normalized: { precoAtual: { value: 38.4, confidence: 0.9 }, dividendYield: { value: 12.3, confidence: 0.8 }, pl: { value: 5.2, confidence: 0.8 }, pvp: { value: 1.15, confidence: 0.8 }, roe: { value: 22.1, confidence: 0.8 } },
  metrics: { generatedAt: new Date().toISOString() }
};
const matrix = buildAssetDataQualityMatrix(sampleAsset);
assert.ok(matrix.score >= 70);
assert.ok(matrix.fields.some(f => f.field === 'precoAtual'));
assert.ok(schemaCatalog().schemas.asset.version.includes('21.5.13'));

const portfolio = await analyzePortfolio({
  positions: [
    { ticker: 'CASH', type: 'CAIXA', quantity: 1000, currentPrice: 1, averagePrice: 1, objective: 'reserva', account: 'Conta' },
    { ticker: 'PETR4', type: 'ACAO', quantity: 10, currentPrice: 38, averagePrice: 30, targetPercent: 50, objective: 'renda', account: 'Corretora', tags: ['energia'] },
    { ticker: 'GARE11', type: 'FII', quantity: 20, currentPrice: 9, averagePrice: 8, targetPercent: 20, objective: 'renda', account: 'Corretora', tags: ['fii'] },
  ],
  targetMonthlyIncome: 100,
  targetPortfolioValue: 5000,
  monthlyContribution: 300,
  view: 'full'
}, { enrich: false, view: 'full' });
assert.equal(portfolio.status, 'OK');
assert.ok(portfolio.intelligence.healthScore.score >= 0);
assert.ok(portfolio.intelligence.incomeStabilityScore.grade);
assert.ok(portfolio.intelligence.dividendCoverage);
assert.ok(Array.isArray(portfolio.intelligence.actionPlan));

const envResp = await call(envHandler, { url: '/api/v1/env' });
assert.equal(envResp.res.statusCode, 200);
assert.ok(envResp.json.rows.some(r => r.name === 'VALORAE_PUBLIC_BASE_URL'));
const schemaResp = await call(schemaHandler, { url: '/api/v1/schema' });
assert.equal(schemaResp.res.statusCode, 200);
assert.ok(schemaResp.json.schemas.asset);
const sourceResp = await call(sourceStatusHandler, { url: '/api/v1/source/status' });
assert.equal(sourceResp.res.statusCode, 200);
assert.ok(Array.isArray(sourceResp.json.providers));

const longRes = makeRes();
const longReq = { method: 'GET', url: '/api/v1/asset?' + 'a=1&'.repeat(200), query: {}, body: {}, headers: {}, socket: { remoteAddress: '127.0.0.1' } };
const route = beginRoute(longReq, longRes, { version: ValoraeEngine.version, methods: ['GET'], route: 'budget-test', maxQueryParams: 10, rateMax: false });
assert.equal(route.done, true);
assert.equal(longRes.statusCode, 400);
assert.ok(String(longRes.body).includes('TOO_MANY_QUERY_PARAMS'));

for (const fixture of ['investidor10-acao-sample.html','investidor10-etf-sample.html','investidor10-bdr-sample.html','investidor10-blocked-sample.html','yahoo-chart-empty.json','yahoo-chart-partial.json','yahoo-chart-429.json','google-news-empty.xml','google-news-malformed.xml']) {
  assert.ok(fs.existsSync(`test/fixtures/source/${fixture}`), `fixture ausente: ${fixture}`);
}

console.log('v21.5.13 mature final release tests OK.');
