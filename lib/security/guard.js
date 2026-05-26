import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';

export const SECURITY_GUARD_VERSION = '21.5.13-mature-final-release-free';

const rateBuckets = new Map();
const DEFAULT_WINDOW_MS = Number(process.env.VALORAE_RATE_LIMIT_WINDOW_MS || 60_000);
const DEFAULT_MAX = Number(process.env.VALORAE_RATE_LIMIT_MAX || 90);
const ADMIN_MAX = Number(process.env.VALORAE_ADMIN_RATE_LIMIT_MAX || 20);
const MAX_BODY_BYTES = Number(process.env.VALORAE_MAX_BODY_BYTES || 512 * 1024);
const MAX_URL_LENGTH = Number(process.env.VALORAE_MAX_URL_LENGTH || 4096);
const MAX_QUERY_PARAMS = Number(process.env.VALORAE_MAX_QUERY_PARAMS || 80);

function truthy(v) {
  return ['1', 'true', 'yes', 'sim', 'on'].includes(String(v || '').toLowerCase());
}

function sha(value = '') {
  return createHash('sha256').update(String(value)).digest('hex');
}

function safeCompare(a = '', b = '') {
  // Compara hashes de tamanho fixo para evitar vazamento de comprimento do token.
  const aa = Buffer.from(sha(String(a)), 'hex');
  const bb = Buffer.from(sha(String(b)), 'hex');
  try { return timingSafeEqual(aa, bb); } catch { return false; }
}

export function getRequestId(req) {
  const incoming = req?.headers?.['x-request-id'] || req?.headers?.['x-vercel-id'];
  return String(incoming || randomUUID()).slice(0, 96);
}

export function getClientIp(req) {
  const realIp = String(req?.headers?.['x-real-ip'] || req?.headers?.['x-vercel-forwarded-for'] || '').split(',')[0].trim();
  const forwarded = String(req?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  return realIp || forwarded || req?.socket?.remoteAddress || 'unknown';
}

function splitCsv(value = '') {
  return String(value || '').split(',').map(s => s.trim()).filter(Boolean);
}

function normalizeOrigin(value = '') {
  try {
    const u = new URL(String(value));
    if (!['https:', 'http:'].includes(u.protocol)) return '';
    return u.origin;
  } catch { return ''; }
}

function resolveCorsOrigin(req) {
  const requestOrigin = normalizeOrigin(req?.headers?.origin || '');
  const strict = truthy(process.env.VALORAE_CORS_STRICT);
  const publicBase = normalizeOrigin(process.env.VALORAE_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL || '');
  const configuredList = [
    ...splitCsv(process.env.VALORAE_CORS_ALLOW_ORIGINS),
    ...splitCsv(process.env.CORS_ALLOW_ORIGINS),
    ...(process.env.CORS_ALLOW_ORIGIN ? [process.env.CORS_ALLOW_ORIGIN] : []),
    ...(strict && publicBase ? [publicBase] : []),
  ].filter(Boolean);
  if (!configuredList.length && !strict) return '*';
  if (configuredList.includes('*') && !strict) return '*';
  const normalizedAllowed = [...new Set(configuredList.map(normalizeOrigin).filter(Boolean))];
  if (requestOrigin && normalizedAllowed.includes(requestOrigin)) return requestOrigin;
  // Em modo strict, devolver a origem pública/primeira allowlist impede navegadores de liberar origens não autorizadas.
  return normalizedAllowed[0] || 'null';
}

function safeCorsRequestHeaders(value = '') {
  const requested = splitCsv(value).filter(h => /^[a-z0-9-]{1,64}$/i.test(h));
  const defaults = ['Content-Type', 'X-Requested-With', 'Authorization', 'X-Valorae-Admin-Token', 'X-Request-Id'];
  return [...new Set([...defaults, ...requested])].join(', ');
}

function appendVary(res, value) {
  const current = String(res.getHeader?.('Vary') || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!current.map(s => s.toLowerCase()).includes(String(value).toLowerCase())) current.push(value);
  res.setHeader('Vary', current.join(', '));
}

export function applySecurityHeaders(req, res, options = {}) {
  const requestId = options.requestId || getRequestId(req);
  const origin = resolveCorsOrigin(req);
  res.setHeader('Access-Control-Allow-Origin', origin);
  if (origin !== '*') appendVary(res, 'Origin');
  res.setHeader('Access-Control-Allow-Methods', options.methods || 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', options.headers || safeCorsRequestHeaders(req?.headers?.['access-control-request-headers'] || ''));
  res.setHeader('Access-Control-Expose-Headers', 'ETag, X-Request-Id, X-Valorae-Engine-Version, X-Valorae-Performance, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset');
  res.setHeader('Access-Control-Max-Age', '86400');
  appendVary(res, 'Access-Control-Request-Headers');
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Valorae-Security', SECURITY_GUARD_VERSION);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if (options.cacheControl !== false) res.setHeader('Cache-Control', options.cacheControl || 'no-store, no-cache, max-age=0, must-revalidate');
  return requestId;
}

export function estimateBodyBytes(req) {
  const len = Number(req?.headers?.['content-length'] || 0);
  if (Number.isFinite(len) && len > 0) return len;
  try { return Buffer.byteLength(JSON.stringify(req?.body || null), 'utf8'); } catch { return 0; }
}

export function assertBodySize(req, maxBytes = MAX_BODY_BYTES) {
  const bytes = estimateBodyBytes(req);
  if (bytes > maxBytes) {
    const err = new Error(`Payload muito grande: ${bytes} bytes. Limite: ${maxBytes} bytes.`);
    err.status = 413;
    err.code = 'PAYLOAD_TOO_LARGE';
    throw err;
  }
  return { bytes, maxBytes };
}

export function assertUrlAndQueryBudget(req, { maxUrlLength = MAX_URL_LENGTH, maxQueryParams = MAX_QUERY_PARAMS } = {}) {
  const rawUrl = String(req?.url || '');
  if (rawUrl.length > maxUrlLength) {
    const err = new Error(`URL muito longa: ${rawUrl.length} caracteres. Limite: ${maxUrlLength}.`);
    err.status = 414;
    err.code = 'URL_TOO_LONG';
    throw err;
  }
  let count = 0;
  try {
    const parsed = new URL(rawUrl || '/', 'https://valorae.local');
    for (const _ of parsed.searchParams) count += 1;
  } catch { count = 0; }
  if (count > maxQueryParams) {
    const err = new Error(`Muitos parâmetros de query: ${count}. Limite: ${maxQueryParams}.`);
    err.status = 400;
    err.code = 'TOO_MANY_QUERY_PARAMS';
    throw err;
  }
  return { urlLength: rawUrl.length, queryParams: count, maxUrlLength, maxQueryParams };
}

function cleanRateBuckets(now = Date.now()) {
  if (rateBuckets.size < 2000) return;
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt < now) rateBuckets.delete(key);
  }
}

export function checkRateLimit(req, options = {}) {
  if (truthy(process.env.VALORAE_RATE_LIMIT_DISABLED)) {
    const production = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
    if (!production || truthy(process.env.VALORAE_RATE_LIMIT_FORCE_DISABLE)) return { limited: false, disabled: true };
  }
  const now = Date.now();
  cleanRateBuckets(now);
  const windowMs = Number(options.windowMs || DEFAULT_WINDOW_MS);
  const max = Number(options.max || DEFAULT_MAX);
  const route = options.route || req?.url?.split('?')?.[0] || 'global';
  const ipHash = sha(getClientIp(req)).slice(0, 16);
  const key = `${route}:${ipHash}`;
  let bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) bucket = { count: 0, resetAt: now + windowMs };
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  const remaining = Math.max(0, max - bucket.count);
  return {
    limited: bucket.count > max,
    limit: max,
    remaining,
    resetAt: new Date(bucket.resetAt).toISOString(),
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    route,
  };
}

export function applyRateLimitHeaders(res, rate = {}) {
  if (!rate || rate.disabled) return;
  res.setHeader('X-RateLimit-Limit', String(rate.limit ?? ''));
  res.setHeader('X-RateLimit-Remaining', String(rate.remaining ?? ''));
  if (rate.resetAt) res.setHeader('X-RateLimit-Reset', String(rate.resetAt));
  if (rate.limited) res.setHeader('Retry-After', String(rate.retryAfterSeconds || 60));
}

export function requireAdmin(req) {
  const configured = process.env.VALORAE_ADMIN_TOKEN || process.env.ADMIN_TOKEN;
  if (!configured) {
    const err = new Error('VALORAE_ADMIN_TOKEN não configurado. Endpoint administrativo desativado por segurança.');
    err.status = 503;
    err.code = 'ADMIN_TOKEN_NOT_CONFIGURED';
    throw err;
  }
  const auth = String(req?.headers?.authorization || '');
  const bearer = auth.replace(/^Bearer\s+/i, '').trim();
  const headerToken = String(req?.headers?.['x-valorae-admin-token'] || '').trim();
  const production = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  const allowQueryToken = truthy(process.env.VALORAE_ADMIN_ALLOW_QUERY_TOKEN) && (!production || truthy(process.env.VALORAE_ADMIN_ALLOW_QUERY_TOKEN_IN_PRODUCTION));
  const queryToken = allowQueryToken ? String(req?.query?.token || '').trim() : '';
  const provided = bearer || headerToken || queryToken;
  if (!provided || !safeCompare(provided, configured)) {
    const err = new Error('Token administrativo inválido ou ausente.');
    err.status = 401;
    err.code = 'ADMIN_UNAUTHORIZED';
    throw err;
  }
  return true;
}

export function sanitizeError(err) {
  const status = Number(err?.status || 500);
  const code = err?.code || (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR');
  const message = status >= 500 && !truthy(process.env.VALORAE_VERBOSE_ERRORS)
    ? 'Erro interno ao processar a requisição.'
    : (err?.message || 'Erro desconhecido.');
  return { status, code, message };
}

export function securityRuntimeStats() {
  const production = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  const disabledRequested = truthy(process.env.VALORAE_RATE_LIMIT_DISABLED);
  const disabledEffective = disabledRequested && (!production || truthy(process.env.VALORAE_RATE_LIMIT_FORCE_DISABLE));
  return {
    version: SECURITY_GUARD_VERSION,
    rateLimit: {
      enabled: !disabledEffective,
      disabledRequested,
      disabledEffective,
      forceDisableInProduction: truthy(process.env.VALORAE_RATE_LIMIT_FORCE_DISABLE),
      buckets: rateBuckets.size,
      windowMs: DEFAULT_WINDOW_MS,
      defaultMax: DEFAULT_MAX,
      adminMax: ADMIN_MAX,
    },
    payloadLimitBytes: MAX_BODY_BYTES,
    maxUrlLength: MAX_URL_LENGTH,
    maxQueryParams: MAX_QUERY_PARAMS,
    corsStrict: truthy(process.env.VALORAE_CORS_STRICT),
    adminEnabled: Boolean(process.env.VALORAE_ADMIN_TOKEN || process.env.ADMIN_TOKEN),
    adminQueryTokenAllowed: truthy(process.env.VALORAE_ADMIN_ALLOW_QUERY_TOKEN) && (String(process.env.NODE_ENV || '').toLowerCase() !== 'production' || truthy(process.env.VALORAE_ADMIN_ALLOW_QUERY_TOKEN_IN_PRODUCTION)),
  };
}

export function adminRateLimit(req) {
  return checkRateLimit(req, { route: 'admin', max: ADMIN_MAX, windowMs: DEFAULT_WINDOW_MS });
}
