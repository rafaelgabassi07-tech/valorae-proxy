import assert from 'node:assert/strict';
import catchAllHandler from '../api/[...path].js';
import indexHandler from '../api/index.js';
import { routeManifest } from '../routes/_router.js';
import { transformResponsePayload } from '../lib/contract/response.js';
import fs from 'node:fs';

function mockReq(url, query = {}, method = 'GET', body = null) {
  return { method, url, query, body, headers: { host: 'example.vercel.app', 'x-forwarded-proto': 'https', 'x-forwarded-for': '127.0.0.1' }, socket: { remoteAddress: '127.0.0.1' } };
}
function mockRes() {
  return { statusCode: 200, body: '', headers: {}, setHeader(k,v){this.headers[k.toLowerCase()]=v}, getHeader(k){return this.headers[String(k).toLowerCase()]}, status(c){this.statusCode=c;return this}, send(b){this.body=b;return this}, end(b=''){this.body=b;return this} };
}
async function call(handler, req) { const res=mockRes(); await handler(req,res); return { res, json: JSON.parse(res.body || '{}') }; }

{
  const files = [];
  function walk(d){ for (const e of fs.readdirSync(d,{withFileTypes:true})){ const p=`${d}/${e.name}`; if(e.isDirectory()) walk(p); else if(p.endsWith('.js')) files.push(p); }}
  walk('api');
  assert.deepEqual(files.sort(), ['api/[...path].js','api/index.js'].sort());
}

{
  const manifest = routeManifest();
  assert.deepEqual(manifest.physicalFunctions, ['api/index.js','api/[...path].js']);
  assert.ok(manifest.routes.includes('/asset'));
  assert.equal(manifest.legacyAliases['/ativo'], '/asset');
  assert.equal(manifest.legacyAliases['/scraper'], '/compat/scraper4');
}

{
  const { res, json } = await call(indexHandler, mockReq('/api'));
  assert.equal(res.statusCode, 200);
  assert.equal(json.router.physicalFunctions.length, 2);
}

{
  const { res, json } = await call(catchAllHandler, mockReq('/api/v1/fields'));
  assert.equal(res.statusCode, 200);
  assert.equal(json.endpoint, 'fields');
}

{
  const { res, json } = await call(catchAllHandler, mockReq('/api/v2/errors'));
  assert.equal(res.statusCode, 200);
  assert.equal(json.schemaVersion, 'envelope-v2');
  assert.equal(json.meta.apiVersion, 'v2');
  assert.equal(json.data.endpoint, 'errors');
}

{
  const payload = transformResponsePayload({ version:'x', a:1, b:2, extra:true }, { query: { envelope:'1', dataFields:'a' }, url:'/api/v2/test' });
  assert.equal(payload.schemaVersion, 'envelope-v2');
  assert.deepEqual(payload.data, { a: 1 });
}

{
  const { res, json } = await call(catchAllHandler, mockReq('/api/unknown-route'));
  assert.equal(res.statusCode, 404);
  assert.equal(json.status, 'NOT_FOUND');
}

console.log('v21.5.13 router/contract tests OK.');
