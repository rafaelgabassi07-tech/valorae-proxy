import assert from 'node:assert/strict';
import fieldsHandler from '../routes/fields.js';
import errorsHandler from '../routes/errors.js';
import { getBaseUrl, resolveSelfScrapeUrl } from '../lib/http/route.js';
import { cacheDriverInfo } from '../lib/cache/memory.js';

function mockReq({ method = 'GET', query = {}, headers = {}, body = null } = {}) {
  return { method, query, headers: { host: 'example.vercel.app', ...headers }, body, socket: { remoteAddress: '127.0.0.1' } };
}

function mockRes() {
  const headers = {};
  return {
    statusCode: 200,
    body: '',
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    getHeader(k) { return headers[String(k).toLowerCase()]; },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
    end(body = '') { this.body = body; return this; },
    headers,
  };
}

async function call(handler, req = mockReq()) {
  const res = mockRes();
  await handler(req, res);
  return { res, json: JSON.parse(res.body || '{}') };
}

{
  const { res, json } = await call(fieldsHandler);
  assert.equal(res.statusCode, 200);
  assert.equal(json.endpoint, 'fields');
  assert.ok(json.stableAssetFields.some(f => f.path === 'normalized'));
  assert.ok(json.normalizedFields.some(f => f.path === 'normalized.dividendYield'));
}

{
  const { res, json } = await call(errorsHandler);
  assert.equal(res.statusCode, 200);
  assert.equal(json.endpoint, 'errors');
  assert.ok(json.errors.some(e => e.code === 'RATE_LIMITED' && e.retryable === true));
  assert.ok(json.headers.includes('X-Request-Id'));
}

{
  const req = mockReq({ headers: { 'x-forwarded-host': 'evil.com\nX-Bad: 1', 'x-forwarded-proto': 'javascript' } });
  assert.equal(getBaseUrl(req), 'https://localhost');
}

{
  const oldDriver = process.env.VALORAE_CACHE_DRIVER;
  const oldRedis = process.env.REDIS_URL;
  process.env.VALORAE_CACHE_DRIVER = 'redis';
  process.env.REDIS_URL = 'redis://example';
  const info = cacheDriverInfo();
  assert.equal(info.driver, 'memory');
  assert.equal(info.persistent, false);
  assert.equal(info.freeOnly, true);
  assert.equal(info.externalRequested, true);
  if (oldDriver === undefined) delete process.env.VALORAE_CACHE_DRIVER; else process.env.VALORAE_CACHE_DRIVER = oldDriver;
  if (oldRedis === undefined) delete process.env.REDIS_URL; else process.env.REDIS_URL = oldRedis;
}

{
  delete process.env.VALORAE_ALLOW_CLIENT_SCRAPE_URL;
  const req = mockReq({ query: { scrapeUrl: 'https://malicious.example/api/scrape' } });
  const resolved = resolveSelfScrapeUrl(req, req.query);
  assert.equal(resolved, 'https://example.vercel.app/api/scrape');
}

console.log('v21.5.1 audit hardening tests OK.');
