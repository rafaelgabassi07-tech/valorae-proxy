import assert from 'node:assert/strict';
import { dispatchRoute } from '../routes/_router.js';
import { extractCustomSelectors } from '../lib/scrape/custom-selectors.js';
import indexHandler from '../api/index.js';

function mockRes() {
  return {
    statusCode: 200,
    body: '',
    headers: {},
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    getHeader(k) { return this.headers[String(k).toLowerCase()]; },
    status(c) { this.statusCode = c; return this; },
    send(b) { this.body = b; return this; },
    end(b = '') { this.body = b; return this; },
  };
}

const html = `<section><div class=card><a href=/acoes/petr4/ data-url=/api/comparador/1><span>PETR4</span></a></div></section>`;
const selected = extractCustomSelectors(html, {
  childText: { selector: 'section > div.card > a[href*=/acoes/] span', extract: 'text' },
  dataUrl: { selector: 'a[href*=/acoes/]', extract: 'data-url' },
  href: { selector: 'a[href*=/acoes/]', extract: 'href' },
});
assert.equal(selected.results.childText[0], 'PETR4');
assert.equal(selected.results.dataUrl[0], '/api/comparador/1');
assert.equal(selected.results.href[0], '/acoes/petr4/');

const resV2 = mockRes();
await dispatchRoute({ method: 'GET', url: '/api/v2/health?dataFields=ok,version', headers: {}, socket: {} }, resV2);
const v2 = JSON.parse(resV2.body);
assert.equal(v2.schemaVersion, 'envelope-v2');
assert.equal(v2.data.ok, true);
assert.ok(v2.data.version);
assert.equal(v2.data.routes, undefined);

process.env.VALORAE_CORS_ALLOW_ORIGINS = 'https://app.example.com,https://admin.example.com';
const resCors = mockRes();
await indexHandler({ method: 'GET', url: '/api', query: {}, headers: { origin: 'https://admin.example.com' }, socket: {} }, resCors);
assert.equal(resCors.headers['access-control-allow-origin'], 'https://admin.example.com');
assert.match(resCors.headers.vary, /Origin/);
delete process.env.VALORAE_CORS_ALLOW_ORIGINS;

const resHead = mockRes();
await indexHandler({ method: 'HEAD', url: '/api', query: {}, headers: {}, socket: {} }, resHead);
assert.equal(resHead.statusCode, 200);
assert.equal(resHead.body, '');
assert.ok(resHead.headers.etag);
assert.ok(Number(resHead.headers['content-length']) > 0);

console.log('v21.5.13 audit corrections tests OK.');
