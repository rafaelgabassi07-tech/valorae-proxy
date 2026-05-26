import assert from 'node:assert/strict';
import { dispatchRoute, routeManifest } from '../routes/_router.js';
import { extractCustomSelectors } from '../lib/scrape/custom-selectors.js';
import batchScrapeHandler from '../routes/batch-scrape.js';
import { sendJson } from '../lib/performance/http.js';
import { ValoraeEngine } from '../lib/Valorae-engine.js';

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

// CSS-lite mais forte: atributo existente, múltiplas classes e combinador filho.
const html = `<section id=root><div class="card primary"><a href=/acoes/petr4/ data-url=/api/comparador/1><span>PETR4</span></a></div><div class="card"><a href="/fiis/gare11/"><span>GARE11</span></a></div></section>`;
const selected = extractCustomSelectors(html, {
  multiClass: { selector: 'div.card.primary > a[href]', extract: 'data-url' },
  attrExists: { selector: 'a[data-url]', extract: 'href' },
  deepText: { selector: '#root div.card a[href*=/fiis/] span', extract: 'text' },
});
assert.equal(selected.results.multiClass[0], '/api/comparador/1');
assert.equal(selected.results.attrExists[0], '/acoes/petr4/');
assert.equal(selected.results.deepText[0], 'GARE11');

// Query repetida preserva array no router, útil para compatibilidade com clientes antigos.
const resQuery = mockRes();
await dispatchRoute({ method: 'GET', url: '/api/health?tag=a&tag=b', headers: {}, socket: {} }, resQuery);
assert.equal(resQuery.statusCode, 200);

// ETag aceita lista If-None-Match e responde 304 sem body.
const first = mockRes();
sendJson({ method: 'GET', query: {}, headers: {} }, first, { version: ValoraeEngine.version, ok: true }, { engineVersion: ValoraeEngine.version });
const second = mockRes();
sendJson({ method: 'GET', query: {}, headers: { 'if-none-match': `"old", ${first.headers.etag}` } }, second, { version: ValoraeEngine.version, ok: true }, { engineVersion: ValoraeEngine.version });
assert.equal(second.statusCode, 304);
assert.equal(second.body, '');
assert.equal(second.headers['content-length'], undefined);

// Batch não deduplica jobs com a mesma URL mas controles de selector diferentes.
const originalScrapeUrl = ValoraeEngine.scrapeUrl;
let calls = 0;
ValoraeEngine.scrapeUrl = async (url) => {
  calls += 1;
  return { ok: true, status: 200, url, finalUrl: url, hostname: 'investidor10.com.br', contentType: 'text/html', html, htmlLength: html.length, provider: 'mock', selectorResults: {}, elapsedMs: 1, cache: 'MISS' };
};
try {
  const res = mockRes();
  await batchScrapeHandler({
    method: 'POST',
    url: '/api/batch-scrape',
    query: {},
    body: {
      jobs: [
        { id: 'limit1', url: 'https://investidor10.com.br/acoes/petr4/', maxPerSelector: 1 },
        { id: 'limit2', url: 'https://investidor10.com.br/acoes/petr4/', maxPerSelector: 2 },
      ],
      selectors: { links: { selector: 'a[href]', extract: 'href' } },
    },
    headers: { 'x-real-ip': '127.0.0.1' },
    socket: { remoteAddress: '127.0.0.1' },
  }, res);
  const json = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(calls, 2);
  assert.equal(json.uniqueCount, 2);
} finally {
  ValoraeEngine.scrapeUrl = originalScrapeUrl;
}

const manifest = routeManifest();
assert.ok(manifest.routes.includes('/health'));
assert.deepEqual(manifest.physicalFunctions, ['api/index.js', 'api/[...path].js']);

console.log('v21.5.13 complete audit hardening tests OK.');
