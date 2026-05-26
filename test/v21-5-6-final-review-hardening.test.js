import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dispatchRoute } from '../routes/_router.js';

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[String(k).toLowerCase()]; },
    removeHeader(k) { delete this.headers[String(k).toLowerCase()]; },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; this.finished = true; return this; },
    end(body = '') { this.body = body; this.finished = true; return this; },
  };
}

const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const hasApiCorsWildcard = (vercel.headers || []).some(entry =>
  String(entry.source || '').includes('/api') &&
  (entry.headers || []).some(h => String(h.key || '').toLowerCase() === 'access-control-allow-origin')
);
assert.equal(hasApiCorsWildcard, false, 'vercel.json não deve sobrescrever CORS runtime da API');

const syncSource = fs.readFileSync('routes/sync.js', 'utf8');
assert.equal(/SUPABASE_|supabase/i.test(syncSource), false, 'sync legado não deve conter ponte para banco/storage externo');

const syncRes = mockRes();
await dispatchRoute({ method: 'GET', url: '/api/sync', query: {}, headers: {}, socket: {} }, syncRes);
const syncPayload = JSON.parse(syncRes.body);
assert.equal(syncRes.statusCode, 410);
assert.equal(syncPayload.status, 'DISABLED');
assert.equal(syncPayload.code, 'SYNC_DISABLED_FREE_ONLY');

const openapi = fs.readFileSync('routes/openapi.js', 'utf8');
assert.ok(openapi.includes('v21.5.13: launch readiness'));
assert.equal(openapi.includes('v20.8 reforça fraquezas'), false);

console.log('v21.5.13 final review hardening tests OK.');
