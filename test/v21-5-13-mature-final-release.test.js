import assert from 'node:assert/strict';
import { transformResponsePayload } from '../lib/contract/response.js';
import { resolveSelfScrapeUrl } from '../lib/http/route.js';
import { requireAdmin, securityRuntimeStats } from '../lib/security/guard.js';

function withEnv(patch, fn) {
  const previous = {};
  for (const key of Object.keys(patch)) previous[key] = process.env[key];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try { return fn(); }
  finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

{
  const payload = { version: '21.5.13', ticker: 'PETR4', results: { dy: '8%' } };
  const out = transformResponsePayload(payload, { query: { fields: 'ticker,results.dy,missing,__proto__.x' }, url: '/api/v1/asset' });
  assert.equal(out.ticker, 'PETR4');
  assert.equal(out.results.dy, '8%');
  assert.equal(out.version, undefined, 'fields deve recortar o payload');
  assert.ok(Array.isArray(out.fieldWarnings), 'fields inválido/inexistente deve gerar fieldWarnings');
  assert.ok(out.fieldWarnings.some(w => w.type === 'invalid' && w.scope === 'fields'));
  assert.ok(out.fieldWarnings.some(w => w.type === 'missing' && w.scope === 'fields'));
}

{
  const payload = { version: '21.5.13', ticker: 'PETR4', results: { dy: '8%' } };
  const out = transformResponsePayload(payload, { query: { fields: '__proto__.x,constructor.y' }, url: '/api/v1/asset' });
  assert.equal(out.ticker, undefined, 'fields totalmente inválido não deve vazar payload completo');
  assert.ok(out.fieldWarnings?.length >= 2);
}

{
  const payload = { version: '21.5.13', requestId: 'r1', ticker: 'PETR4', results: { dy: '8%' } };
  const out = transformResponsePayload(payload, { query: { apiVersion: 'v2', dataFields: 'ticker,missing,constructor.x' }, url: '/api/v2/asset' });
  assert.equal(out.schemaVersion, 'envelope-v2');
  assert.deepEqual(Object.keys(out.data).sort(), ['ticker']);
  assert.ok(out.meta.fieldWarnings.some(w => w.scope === 'dataFields' && w.type === 'missing'));
  assert.ok(out.meta.fieldWarnings.some(w => w.scope === 'dataFields' && w.type === 'invalid'));
}

withEnv({ VALORAE_ALLOW_CLIENT_SCRAPE_URL: '1', VALORAE_PUBLIC_BASE_URL: 'https://example.com' }, () => {
  const req = { method: 'GET', url: '/api/asset', headers: { host: 'example.com' }, query: {}, body: {} };
  assert.equal(resolveSelfScrapeUrl(req, { scrapeUrl: 'https://example.com/api/scrape' }), 'https://example.com/api/scrape');
  assert.throws(() => resolveSelfScrapeUrl(req, { scrapeUrl: 'https://example.com/api/scrapevil' }), /exatamente para \/api\/scrape/);
});

withEnv({ NODE_ENV: 'production', VALORAE_ADMIN_TOKEN: 'secret-token', VALORAE_ADMIN_ALLOW_QUERY_TOKEN: '1', VALORAE_ADMIN_ALLOW_QUERY_TOKEN_IN_PRODUCTION: undefined }, () => {
  assert.throws(() => requireAdmin({ headers: {}, query: { token: 'secret-token' } }), /Token administrativo inválido/);
  assert.equal(requireAdmin({ headers: { 'x-valorae-admin-token': 'secret-token' }, query: {} }), true);
});

withEnv({ NODE_ENV: 'production', VALORAE_RATE_LIMIT_DISABLED: '1', VALORAE_RATE_LIMIT_FORCE_DISABLE: undefined }, () => {
  const stats = securityRuntimeStats();
  assert.equal(stats.rateLimit.disabledRequested, true);
  assert.equal(stats.rateLimit.disabledEffective, false);
  assert.equal(stats.rateLimit.enabled, true, 'produção não deve desativar rate limit sem FORCE_DISABLE');
});

withEnv({ NODE_ENV: 'production', VALORAE_RATE_LIMIT_DISABLED: '1', VALORAE_RATE_LIMIT_FORCE_DISABLE: '1' }, () => {
  const stats = securityRuntimeStats();
  assert.equal(stats.rateLimit.disabledEffective, true);
  assert.equal(stats.rateLimit.enabled, false);
});

console.log('v21.5.13 mature final release tests OK.');
