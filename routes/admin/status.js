import { ValoraeEngine, getValoraeRuntimeStats, runValoraeSelfTest } from '../../lib/Valorae-engine.js';
import { sendJson } from '../../lib/performance/http.js';
import { applySecurityHeaders, adminRateLimit, applyRateLimitHeaders, requireAdmin, sanitizeError, securityRuntimeStats } from '../../lib/security/guard.js';

export default async function handler(req, res) {
  const requestId = applySecurityHeaders(req, res, { methods: 'GET, OPTIONS', cacheControl: 'no-store' });
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return sendJson(req, res, { version: ValoraeEngine.version, error: 'Método não permitido. Use GET.' }, { status: 405, engineVersion: ValoraeEngine.version, profile: 'admin' });
  const rate = adminRateLimit(req);
  applyRateLimitHeaders(res, rate);
  if (rate.limited) return sendJson(req, res, { version: ValoraeEngine.version, status: 'RATE_LIMITED', rate }, { status: 429, engineVersion: ValoraeEngine.version, profile: 'admin' });
  try {
    requireAdmin(req);
    const mem = process.memoryUsage();
    return sendJson(req, res, {
      ok: true,
      requestId,
      name: 'Valorae Admin Status',
      version: ValoraeEngine.version,
      time: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      runtime: {
        node: process.version,
        platform: process.platform,
        memory: {
          rss: mem.rss,
          heapUsed: mem.heapUsed,
          heapTotal: mem.heapTotal,
          external: mem.external,
        },
      },
      engine: getValoraeRuntimeStats(),
      security: securityRuntimeStats(),
      selfTest: runValoraeSelfTest(),
    }, { status: 200, engineVersion: ValoraeEngine.version, profile: 'admin', cachePolicy: 'no-store' });
  } catch (err) {
    const safe = sanitizeError(err);
    return sendJson(req, res, { version: ValoraeEngine.version, status: 'ERROR', requestId, error: safe.message, code: safe.code }, { status: safe.status, engineVersion: ValoraeEngine.version, profile: 'admin' });
  }
}
