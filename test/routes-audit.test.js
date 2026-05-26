import assert from 'node:assert/strict';
import health from '../routes/health.js';
import asset from '../routes/asset.js';
import compare from '../routes/compare.js';
import scrape from '../routes/scrape.js';
import transactions from '../routes/portfolio/transactions.js';
import sync from '../routes/sync.js';
import { resolveSelfScrapeUrl } from '../lib/http/route.js';

class MockRes {
  constructor() { this.headers = {}; this.statusCode = 200; this.body = undefined; this.ended = false; }
  setHeader(k, v) { this.headers[k.toLowerCase()] = v; return this; }
  getHeader(k) { return this.headers[String(k).toLowerCase()]; }
  status(code) { this.statusCode = code; return this; }
  json(value) { this.body = value; this.ended = true; return this; }
  send(value) { this.body = value; this.ended = true; return this; }
  end(value = '') { this.body = value; this.ended = true; return this; }
}

function req(method = 'GET', query = {}, body = undefined) {
  return {
    method,
    query,
    body,
    headers: { host: 'valorae-proxy.vercel.app', 'x-forwarded-proto': 'https', 'x-forwarded-for': '127.0.0.1' },
    socket: { remoteAddress: '127.0.0.1' },
    url: '/test',
  };
}

function parseBody(res) {
  if (typeof res.body === 'string' && res.body) return JSON.parse(res.body);
  return res.body;
}

async function call(handler, request) {
  const response = new MockRes();
  await handler(request, response);
  return response;
}

const r1 = await call(health, req('GET'));
assert.equal(r1.statusCode, 200);
assert.equal(parseBody(r1).ok, true);
assert.equal(r1.getHeader('x-content-type-options'), 'nosniff');

const r2 = await call(asset, req('GET', {}));
assert.equal(r2.statusCode, 400);
assert.match(parseBody(r2).error, /Ticker vazio/);
assert.ok(parseBody(r2).requestId);

const r3 = await call(compare, req('GET', { tickers: 'PETR4' }));
assert.equal(r3.statusCode, 400);
assert.match(parseBody(r3).error, /ao menos dois/i);

const r4 = await call(scrape, req('GET', {}));
assert.equal(r4.statusCode, 400);
assert.match(parseBody(r4).error, /URL HTTPS permitida/i);

const r5 = await call(transactions, req('GET'));
assert.equal(r5.statusCode, 405);
assert.match(parseBody(r5).error, /Método não permitido/);

const oldUrl = process.env.SUPABASE_URL;
const oldKey = process.env.SUPABASE_ANON_KEY;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_ANON_KEY;
const r6 = await call(sync, req('GET'));
assert.equal(r6.statusCode, 410);
assert.equal(parseBody(r6).status, 'DISABLED');
if (oldUrl !== undefined) process.env.SUPABASE_URL = oldUrl;
if (oldKey !== undefined) process.env.SUPABASE_ANON_KEY = oldKey;

const malicious = resolveSelfScrapeUrl(req('GET', { scrapeUrl: 'https://evil.example/api/scrape' }), { scrapeUrl: 'https://evil.example/api/scrape' });
assert.equal(malicious, 'https://valorae-proxy.vercel.app/api/scrape');

console.log('Route audit tests OK: headers, erros JSON, métodos e scrapeUrl seguro passaram.');
