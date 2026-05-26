import { ValoraeEngine, clearValoraeCaches, getValoraeRuntimeStats } from '../../lib/Valorae-engine.js';
import { sendJson } from '../../lib/performance/http.js';
import { applySecurityHeaders, adminRateLimit, applyRateLimitHeaders, requireAdmin, sanitizeError } from '../../lib/security/guard.js';

export default async function handler(req, res) {
  const requestId = applySecurityHeaders(req, res, { methods: 'GET, POST, DELETE, OPTIONS', cacheControl: 'no-store' });
  if (req.method === 'OPTIONS') return res.status(200).end();
  const rate = adminRateLimit(req);
  applyRateLimitHeaders(res, rate);
  if (rate.limited) return sendJson(req, res, { version: ValoraeEngine.version, status: 'RATE_LIMITED', rate }, { status: 429, engineVersion: ValoraeEngine.version, profile: 'admin' });
  try {
    requireAdmin(req);
    if (req.method === 'GET') {
      return sendJson(req, res, { ok: true, requestId, version: ValoraeEngine.version, caches: getValoraeRuntimeStats().caches }, { status: 200, engineVersion: ValoraeEngine.version, profile: 'admin' });
    }
    if (!['POST', 'DELETE'].includes(req.method)) {
      return sendJson(req, res, { version: ValoraeEngine.version, error: 'Método não permitido. Use GET, POST ou DELETE.' }, { status: 405, engineVersion: ValoraeEngine.version, profile: 'admin' });
    }
    const input = req.method === 'POST' ? (req.body || {}) : req.query;
    const scope = input.scope || req.query?.scope || 'all';
    const result = clearValoraeCaches(scope);
    return sendJson(req, res, { ...result, requestId, version: ValoraeEngine.version }, { status: 200, engineVersion: ValoraeEngine.version, profile: 'admin' });
  } catch (err) {
    const safe = sanitizeError(err);
    return sendJson(req, res, { version: ValoraeEngine.version, status: 'ERROR', requestId, error: safe.message, code: safe.code }, { status: safe.status, engineVersion: ValoraeEngine.version, profile: 'admin' });
  }
}
