import assert from 'node:assert/strict';
import { routeManifest } from '../routes/_router.js';
import readyHandler from '../routes/ready.js';
import manifestHandler from '../routes/manifest.js';
import pkg from '../package.json' with { type: 'json' };

function mockReq(url, method = 'GET') {
  return { method, url, query: {}, headers: { host: 'example.vercel.app', 'x-forwarded-proto': 'https', 'x-forwarded-for': '127.0.0.1' }, socket: { remoteAddress: '127.0.0.1' } };
}
function mockRes() {
  return { statusCode: 200, body: '', headers: {}, setHeader(k,v){ this.headers[k.toLowerCase()] = v; }, getHeader(k){ return this.headers[String(k).toLowerCase()]; }, status(c){ this.statusCode = c; return this; }, send(b){ this.body = b; return this; }, end(b=''){ this.body = b; return this; } };
}
async function call(handler, url) { const req = mockReq(url); const res = mockRes(); await handler(req,res); return { res, json: JSON.parse(res.body || '{}') }; }

const m = routeManifest();
assert.ok(m.routes.includes('/ready'));
assert.ok(m.routes.includes('/manifest'));
assert.deepEqual(m.physicalFunctions, ['api/index.js','api/[...path].js']);

const ready = await call(readyHandler, '/api/v1/ready');
assert.equal(ready.res.statusCode, 200);
assert.equal(ready.json.status, 'READY');
assert.equal(ready.json.freeOnly, true);
assert.equal(ready.json.release, pkg.version);
assert.ok(Array.isArray(ready.json.checks));

const manifest = await call(manifestHandler, '/api/v1/manifest');
assert.equal(manifest.res.statusCode, 200);
assert.equal(manifest.json.release, pkg.version);
assert.equal(manifest.json.freeOnly, true);
assert.ok(manifest.json.capabilities.portfolio.includes('intelligence'));
assert.ok(manifest.json.capabilities.reliability.includes('ready'));

assert.equal(pkg.scripts.typecheck, 'node scripts/typecheck-free.js');
assert.equal(Object.keys(pkg.dependencies || {}).length, 0);
assert.equal(Boolean(pkg.devDependencies && Object.keys(pkg.devDependencies).length), false);

console.log('v21.5.13 launch readiness tests OK.');
