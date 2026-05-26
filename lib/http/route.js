import { sendJson } from '../performance/http.js';
import { applySecurityHeaders, checkRateLimit, applyRateLimitHeaders, assertBodySize, assertUrlAndQueryBudget, sanitizeError } from '../security/guard.js';

export const VALORAE_ROUTE_UTILS_VERSION = '21.5.13-mature-final-release-free';

export function boolParam(v, fallback = false) {
  if (v === undefined || v === null || v === '') return fallback;
  return ['1', 'true', 'yes', 'sim', 'on'].includes(String(v).toLowerCase());
}

export function falseParam(v) {
  return ['0', 'false', 'no', 'nao', 'não', 'off'].includes(String(v || '').toLowerCase());
}

export function isReadLikeMethod(method) {
  return method === 'GET' || method === 'HEAD';
}

export function getInput(req) {
  return isReadLikeMethod(req?.method) ? (req.query || {}) : (req.body || {});
}

export function clampNumber(value, fallback, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function safeForwardedProto(value) {
  const proto = String(value || '').split(',')[0].trim().toLowerCase();
  return proto === 'http' ? 'http' : 'https';
}

function safeForwardedHost(value) {
  const host = String(value || '').split(',')[0].trim().toLowerCase();
  // Mantém apenas formato de host/porta válido o suficiente para montar URLs internas,
  // evitando caracteres de controle/injeção por cabeçalho em ambientes proxy.
  if (/^[a-z0-9.-]+(?::\d{1,5})?$/.test(host)) return host;
  return 'localhost';
}

export function getBaseUrl(req) {
  const explicit = process.env.VALORAE_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL;
  if (explicit) return String(explicit).replace(/\/$/, '');
  const proto = safeForwardedProto(req?.headers?.['x-forwarded-proto'] || 'https');
  const host = safeForwardedHost(req?.headers?.['x-forwarded-host'] || req?.headers?.host || 'localhost');
  return `${proto}://${host}`.replace(/\/$/, '');
}

function allowedScrapeHosts(req) {
  const hosts = new Set();
  try { hosts.add(new URL(getBaseUrl(req)).hostname.toLowerCase()); } catch {}
  for (const raw of [process.env.VALORAE_PUBLIC_BASE_URL, process.env.PUBLIC_BASE_URL, process.env.VALORAE_SCRAPE_URL]) {
    if (!raw) continue;
    try { hosts.add(new URL(raw).hostname.toLowerCase()); } catch {}
  }
  String(process.env.VALORAE_ALLOWED_SCRAPE_HOSTS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
    .forEach(h => hosts.add(h));
  return hosts;
}

export function resolveSelfScrapeUrl(req, input = {}) {
  const envUrl = String(process.env.VALORAE_SCRAPE_URL || '').trim();
  const fallback = envUrl || `${getBaseUrl(req)}/api/scrape`;
  const supplied = String(input.valoraeScrapeUrl || input.scrapeUrl || '').trim();
  if (!supplied) return fallback;

  // Por segurança, clientes públicos não podem redirecionar o proxy para um scraper arbitrário.
  // Isso evita SSRF/exfiltração e mantém o deploy simples no GitHub/Vercel.
  if (!boolParam(process.env.VALORAE_ALLOW_CLIENT_SCRAPE_URL, false)) return fallback;

  let parsed;
  try { parsed = new URL(supplied); } catch {
    const err = new Error('scrapeUrl inválida.');
    err.status = 400;
    err.code = 'INVALID_SCRAPE_URL';
    throw err;
  }
  const isLocalDev = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname) && process.env.NODE_ENV !== 'production';
  if (parsed.protocol !== 'https:' && !(isLocalDev && parsed.protocol === 'http:')) {
    const err = new Error('scrapeUrl precisa usar HTTPS.');
    err.status = 400;
    err.code = 'INVALID_SCRAPE_URL_PROTOCOL';
    throw err;
  }
  const allowed = allowedScrapeHosts(req);
  if (!allowed.has(parsed.hostname.toLowerCase())) {
    const err = new Error('scrapeUrl não permitida para este deploy.');
    err.status = 403;
    err.code = 'SCRAPE_URL_NOT_ALLOWED';
    throw err;
  }
  const normalizedScrapePath = parsed.pathname.replace(/\/+$/, '') || '/';
  if (normalizedScrapePath !== '/api/scrape') {
    const err = new Error('scrapeUrl precisa apontar exatamente para /api/scrape.');
    err.status = 400;
    err.code = 'INVALID_SCRAPE_URL_PATH';
    throw err;
  }
  return parsed.toString();
}

export function parseList(input) {
  if (Array.isArray(input)) return input;
  if (typeof input === 'string') return input.split(',');
  return [];
}

export function beginRoute(req, res, options = {}) {
  const version = options.version || 'unknown';
  const methods = options.methods || ['GET'];
  const effectiveMethods = methods.includes('GET') ? [...new Set([...methods, 'HEAD'])] : methods;
  const requestId = applySecurityHeaders(req, res, {
    methods: [...new Set([...effectiveMethods, 'OPTIONS'])].join(', '),
    cacheControl: options.cacheControl ?? 'no-store, no-cache, max-age=0, must-revalidate',
    headers: options.headers,
  });
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return { done: true, requestId };
  }
  try {
    assertUrlAndQueryBudget(req, { maxUrlLength: options.maxUrlLength, maxQueryParams: options.maxQueryParams });
  } catch (err) {
    const safe = sanitizeError(err);
    sendJson(req, res, { version, status: 'ERROR', requestId, code: safe.code, error: safe.message }, { status: safe.status, engineVersion: version, profile: options.profile || options.route || 'api' });
    return { done: true, requestId };
  }
  if (!effectiveMethods.includes(req.method)) {
    sendJson(req, res, {
      version,
      requestId,
      error: `Método não permitido. Use ${effectiveMethods.join(' ou ')}.`,
    }, { status: 405, engineVersion: version, profile: options.profile || options.route || 'api' });
    return { done: true, requestId };
  }
  const rateMax = options.rateMax;
  if (rateMax !== false) {
    const rate = checkRateLimit(req, {
      route: options.route || req.url?.split('?')?.[0] || 'api',
      max: Number(rateMax || process.env.VALORAE_RATE_LIMIT_MAX || 90),
      windowMs: options.rateWindowMs,
    });
    applyRateLimitHeaders(res, rate);
    if (rate.limited) {
      sendJson(req, res, { version, status: 'RATE_LIMITED', requestId, rate }, { status: 429, engineVersion: version, profile: options.profile || options.route || 'api' });
      return { done: true, requestId, rate };
    }
  }
  try {
    if (!isReadLikeMethod(req.method)) assertBodySize(req, options.maxBodyBytes);
  } catch (err) {
    const safe = sanitizeError(err);
    sendJson(req, res, { version, status: 'ERROR', requestId, code: safe.code, error: safe.message }, { status: safe.status, engineVersion: version, profile: options.profile || options.route || 'api' });
    return { done: true, requestId };
  }
  return { done: false, requestId, input: getInput(req) };
}

export function sendRouteError(req, res, err, options = {}) {
  const safe = sanitizeError(err);
  return sendJson(req, res, {
    version: options.version,
    status: 'ERROR',
    requestId: options.requestId,
    code: safe.code,
    error: safe.message,
  }, { status: safe.status, engineVersion: options.version, profile: options.profile || 'api' });
}
