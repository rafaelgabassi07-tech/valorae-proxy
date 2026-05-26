import assert from 'node:assert/strict';
import { extractCustomSelectors } from '../lib/scrape/custom-selectors.js';
import batchScrapeHandler from '../routes/batch-scrape.js';
import { ValoraeEngine } from '../lib/Valorae-engine.js';

const html = `
<table><tbody>
  <tr><td>#1</td><td>PETR4</td><td>R$ 42,10</td><td>+2,35%</td></tr>
  <tr><td>#2</td><td>VALE3</td><td>R$ 61,20</td><td>-1,10%</td></tr>
</tbody></table>
<div class="card"><a href="/acoes/petr4/" data-url="/api/comparador/1">PETR4</a></div>`;

const selected = extractCustomSelectors(html, {
  rows: { selector: 'table tbody tr', extract: 'text' },
  cells: { selector: 'table tbody tr td', extract: 'text' },
  compareUrl: { selector: 'div.card a[href*="/acoes/"]', extract: 'data-url' },
});
assert.equal(selected.results.rows.length, 2);
assert.ok(selected.results.rows[0].includes('PETR4'));
assert.deepEqual(selected.results.cells.slice(0, 4), ['#1', 'PETR4', 'R$ 42,10', '+2,35%']);
assert.equal(selected.results.compareUrl[0], '/api/comparador/1');

function mockReq(body) {
  return {
    method: 'POST',
    url: '/api/batch-scrape',
    query: {},
    body,
    headers: { host: 'example.vercel.app', 'x-forwarded-proto': 'https', 'x-forwarded-for': '127.0.0.1' },
    socket: { remoteAddress: '127.0.0.1' },
  };
}
function mockRes() {
  return { statusCode: 200, body: '', headers: {}, setHeader(k,v){this.headers[k.toLowerCase()]=v}, getHeader(k){return this.headers[String(k).toLowerCase()]}, status(c){this.statusCode=c;return this}, send(b){this.body=b;return this}, end(b=''){this.body=b;return this} };
}

const originalScrapeUrl = ValoraeEngine.scrapeUrl;
let calls = 0;
ValoraeEngine.scrapeUrl = async (url) => {
  calls += 1;
  return { ok: true, status: 200, url, finalUrl: url, hostname: 'investidor10.com.br', contentType: 'text/html', html, htmlLength: html.length, provider: 'mock', selectorResults: {}, elapsedMs: 1, cache: 'MISS' };
};
try {
  const res = mockRes();
  await batchScrapeHandler(mockReq({
    jobs: [
      { id: 'a', url: 'https://investidor10.com.br/acoes/petr4/' },
      { id: 'b', url: 'https://investidor10.com.br/acoes/petr4/' },
    ],
    selectors: { rows: { selector: 'table tbody tr', extract: 'text' } },
  }), res);
  const json = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(calls, 1);
  assert.equal(json.uniqueCount, 1);
  assert.equal(json.dedupedCount, 1);
  assert.equal(json.results[1].dedupedFrom, 0);
  assert.equal(json.results[0].results.rows.length, 2);
} finally {
  ValoraeEngine.scrapeUrl = originalScrapeUrl;
}

console.log('v21.5.13 scraper compatibility hardening tests OK.');
