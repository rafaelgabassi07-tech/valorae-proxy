import indexHandler from '../api/index.js';
import catchAllHandler from '../api/[...path].js';

function mockReq(url, query = {}) {
  return { method: 'GET', url, query, headers: { host: 'example.vercel.app', 'x-forwarded-proto': 'https', 'x-forwarded-for': '127.0.0.1' }, socket: { remoteAddress: '127.0.0.1' } };
}
function mockRes() {
  return { statusCode: 200, body: '', headers: {}, setHeader(k,v){this.headers[k.toLowerCase()]=v}, getHeader(k){return this.headers[String(k).toLowerCase()]}, status(c){this.statusCode=c;return this}, send(b){this.body=b;return this}, end(b=''){this.body=b;return this} };
}
async function call(handler, req) { const res=mockRes(); await handler(req,res); return { res, json: JSON.parse(res.body || '{}') }; }

const checks = [
  [indexHandler, mockReq('/api'), 200],
  [catchAllHandler, mockReq('/api/health'), 200],
  [catchAllHandler, mockReq('/api/v1/ready'), 200],
  [catchAllHandler, mockReq('/api/v1/manifest'), 200],
  [catchAllHandler, mockReq('/api/v1/env'), 200],
  [catchAllHandler, mockReq('/api/v1/schema'), 200],
  [catchAllHandler, mockReq('/api/v1/source/status'), 200],
  [catchAllHandler, mockReq('/api/v1/fields'), 200],
  [catchAllHandler, mockReq('/api/v2/errors'), 200],
  [catchAllHandler, mockReq('/api/unknown'), 404],
];
for (const [handler, req, expected] of checks) {
  const { res } = await call(handler, req);
  if (res.statusCode !== expected) throw new Error(`${req.url}: esperado ${expected}, veio ${res.statusCode}`);
}
console.log('Smoke OK: index, ready, manifest, env, schema, source/status, router v1/v2, envelope v2 e 404 interno.');
