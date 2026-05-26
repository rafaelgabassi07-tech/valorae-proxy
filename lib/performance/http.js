import { createHash } from 'node:crypto';
import { transformResponsePayload } from '../contract/response.js';

const VOLATILE_ETAG_KEYS = new Set(['generatedAt', 'checkedAt', 'requestId']);

function stableBody(payload) {
  return JSON.stringify(payload ?? null);
}

function stripVolatileForEtag(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stripVolatileForEtag);
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (VOLATILE_ETAG_KEYS.has(key)) continue;
    out[key] = stripVolatileForEtag(val);
  }
  return out;
}

function bodyForEtag(payload) {
  return stableBody(stripVolatileForEtag(payload));
}

function schemaVersionFromPayload(payload = {}) {
  return payload?.schemaVersion || payload?.schema?.version || payload?.data?.schemaVersion || payload?.data?.schema?.version || undefined;
}

function sourceStatusFromPayload(payload = {}) {
  const reports = payload?.sourceReport?.sourcesTried || payload?.data?.sourceReport?.sourcesTried || [];
  if (Array.isArray(reports) && reports.some(r => r.blocked)) return 'blocked';
  if (Array.isArray(reports) && reports.some(r => r.ok)) return 'ok';
  if (payload?.sourceDrift?.sourceDrift || payload?.data?.sourceDrift?.sourceDrift) return 'drift';
  if (payload?.partial || payload?.data?.partial) return 'partial';
  return undefined;
}

export function setCommonPerformanceHeaders(res, options = {}) {
  res.setHeader('X-Valorae-Performance', options.profile || options.performanceProfile || 'standard');
  res.setHeader('X-Valorae-Cache-Policy', options.cachePolicy || 'memory-lru-stale-if-error');
  if (options.engineVersion) res.setHeader('X-Valorae-Engine-Version', options.engineVersion);
  if (options.schemaVersion) res.setHeader('X-Valorae-Schema-Version', options.schemaVersion);
  if (options.cacheStatus) res.setHeader('X-Valorae-Cache', options.cacheStatus);
  if (options.sourceStatus) res.setHeader('X-Valorae-Source-Status', options.sourceStatus);
}

export function sendJson(req, res, payload, options = {}) {
  const status = Number(options.status || 200);
  const effectivePayload = transformResponsePayload(payload, req);
  const body = stableBody(effectivePayload);
  const etagSource = options.volatileEtag === true ? body : bodyForEtag(effectivePayload);
  const etag = `"${createHash('sha1').update(etagSource).digest('base64url')}"`;
  const reqEtag = req?.headers?.['if-none-match'];
  setCommonPerformanceHeaders(res, { ...options, schemaVersion: options.schemaVersion || schemaVersionFromPayload(effectivePayload), sourceStatus: options.sourceStatus || sourceStatusFromPayload(effectivePayload), cacheStatus: options.cacheStatus || effectivePayload?.cacheStatus || effectivePayload?.cache?.status });
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('ETag', etag);
  const bytes = Buffer.byteLength(body, 'utf8');
  res.setHeader('Content-Length', String(bytes));
  res.setHeader('X-Valorae-Response-Bytes', String(bytes));
  if (options.cacheControl) res.setHeader('Cache-Control', options.cacheControl);
  const etagMatches = String(reqEtag || '').split(',').map(s => s.trim()).includes(etag);
  if (etagMatches && status === 200 && req?.method !== 'HEAD') {
    res.removeHeader?.('Content-Length');
    return res.status(304).end();
  }
  if (etagMatches && status === 200 && req?.method === 'HEAD') {
    res.removeHeader?.('Content-Length');
    return res.status(304).end();
  }
  if (req?.method === 'HEAD') return res.status(status).end();
  return res.status(status).send(body);
}
