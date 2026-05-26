import { numberEnv, sendMethodNotAllowed, setCors } from '../lib/vercel-runtime.js';
// Vercel Serverless Function: /api/batch-scrape
// Busca várias páginas permitidas com cache em memória, coalescing e limite de concorrência.

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:138.0) Gecko/20100101 Firefox/138.0',
];

const ALLOWED_HOSTS = new Set([
  'investidor10.com.br',
  'www.investidor10.com.br',
  'statusinvest.com.br',
  'www.statusinvest.com.br',
]);

const FETCH_TIMEOUT_MS = numberEnv('FETCH_TIMEOUT_MS', 12_000, { min: 3000, max: 55_000 });
const MAX_JOBS = numberEnv('MAX_BATCH_JOBS', 25, { min: 1, max: 25 });
const DEFAULT_CONCURRENCY = numberEnv('BATCH_CONCURRENCY', 6, { min: 1, max: 8 });
const MAX_HTML_RESPONSE_CHARS = numberEnv('MAX_HTML_RESPONSE_CHARS', 1_200_000, { min: 50_000, max: 3_000_000 });
const MAX_BATCH_TOTAL_HTML_CHARS = numberEnv('MAX_BATCH_TOTAL_HTML_CHARS', 3_200_000, { min: 100_000, max: 4_000_000 });
const memoryCache = globalThis.__NEXUS_BATCH_CACHE__ ||= new Map();
const inFlight = globalThis.__NEXUS_BATCH_INFLIGHT__ ||= new Map();

const STEALTH_HEADERS = {
  'Sec-Ch-Ua': '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
  'Sec-Ch-Ua-Mobile': '?0',
  'Sec-Ch-Ua-Platform': '"Windows"',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function validateUrl(rawUrl) {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'https:') throw new Error('Apenas URLs HTTPS são permitidas.');
  if (!ALLOWED_HOSTS.has(parsed.hostname)) throw new Error(`Domínio não permitido: ${parsed.hostname}`);
  return parsed;
}

function cleanForwardedHeaders(headers = {}) {
  const {
    'X-Cache-Version': _cv,
    'host': _h,
    'authorization': _a,
    'cookie': _c,
    'Cookie': _c2,
    ...safe
  } = headers && typeof headers === 'object' ? headers : {};
  return safe;
}

async function fetchOne(job) {
  const parsedUrl = validateUrl(job.url);
  const cacheTtl = Number(job.cacheTtl || 900_000);
  const cacheVersion = job.headers?.['X-Cache-Version'] || 'default';
  const htmlMode = job.returnHtml === false ? 'nohtml' : 'html';
  const cacheKey = `${cacheVersion}:${htmlMode}:${job.url}`;
  const now = Date.now();
  const cached = memoryCache.get(cacheKey);

  if (cached && now < cached.expiresAt) {
    return { ...cached.payload, metrics: { ...cached.payload.metrics, cacheStatus: 'HIT' } };
  }

  if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);

  const p = (async () => {
    const startMs = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const safeForwarded = cleanForwardedHeaders(job.headers);
    const userAgent = safeForwarded['User-Agent'] || randomUA();

    try {
      const response = await fetch(job.url, {
        signal: controller.signal,
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Referer': `https://${parsedUrl.hostname}/`,
          ...STEALTH_HEADERS,
          ...safeForwarded,
          'User-Agent': userAgent,
        },
      });

      clearTimeout(timeoutId);
      const elapsedMs = Date.now() - startMs;
      const originalHtml = response.ok ? await response.text() : '';
      const shouldReturnHtml = job.returnHtml !== false;
      const truncated = shouldReturnHtml && originalHtml.length > MAX_HTML_RESPONSE_CHARS;
      const html = shouldReturnHtml ? (truncated ? originalHtml.slice(0, MAX_HTML_RESPONSE_CHARS) : originalHtml) : '';
      const payload = {
        id: job.id,
        url: job.url,
        ok: response.ok,
        status: response.status,
        html,
        data: html,
        error: response.ok ? undefined : `Site-alvo retornou ${response.status} ${response.statusText}`,
        metrics: {
          cacheStatus: 'MISS',
          elapsedMs,
          statusCode: response.status,
          contentLength: html.length,
          originalContentLength: originalHtml.length,
          truncated,
          responseLimitChars: MAX_HTML_RESPONSE_CHARS,
          uaSource: safeForwarded['User-Agent'] ? 'engine' : 'pool',
        },
      };

      if (response.ok && cacheTtl > 0) memoryCache.set(cacheKey, { expiresAt: Date.now() + cacheTtl, payload });
      return payload;
    } finally {
      clearTimeout(timeoutId);
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, p);
  return p;
}

async function runPool(items, concurrency) {
  const results = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const current = idx++;
      try {
        results[current] = await fetchOne(items[current]);
      } catch (error) {
        results[current] = {
          id: items[current]?.id,
          url: items[current]?.url,
          ok: false,
          status: 0,
          html: '',
          data: '',
          error: error?.message || String(error),
          metrics: { cacheStatus: 'ERROR' },
        };
      }
    }
  });
  await Promise.all(workers);
  return results;
}


function enforceBatchPayloadLimit(results) {
  let remaining = MAX_BATCH_TOTAL_HTML_CHARS;
  for (const result of results) {
    if (!result?.html) continue;
    if (remaining <= 0) {
      result.html = '';
      result.data = '';
      result.metrics = { ...(result.metrics || {}), batchPayloadTruncated: true, batchResponseLimitChars: MAX_BATCH_TOTAL_HTML_CHARS };
      continue;
    }
    if (result.html.length > remaining) {
      result.html = result.html.slice(0, remaining);
      result.data = result.html;
      result.metrics = { ...(result.metrics || {}), batchPayloadTruncated: true, batchResponseLimitChars: MAX_BATCH_TOTAL_HTML_CHARS };
      remaining = 0;
    } else {
      remaining -= result.html.length;
    }
  }
  return results;
}

export default async function handler(req, res) {
  setCors(res, 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return sendMethodNotAllowed(res, 'POST, OPTIONS');

  const jobs = Array.isArray(req.body?.jobs) ? req.body.jobs : [];
  if (!jobs.length) return res.status(400).json({ error: 'Envie { jobs: [{ id, url, headers?, cacheTtl? }] }.' });
  if (jobs.length > MAX_JOBS) return res.status(400).json({ error: `Máximo de ${MAX_JOBS} jobs por chamada.` });

  const normalized = jobs.map((job, i) => ({ id: job.id || String(i), ...job }));
  const concurrency = Math.max(1, Math.min(Number(req.body?.concurrency || DEFAULT_CONCURRENCY), 8));
  const startedAt = Date.now();
  const results = enforceBatchPayloadLimit(await runPool(normalized, concurrency));

  return res.status(200).json({
    count: results.length,
    ok: results.filter(r => r.ok).length,
    results,
    metrics: {
      elapsedMs: Date.now() - startedAt,
      concurrency,
      cacheSize: memoryCache.size,
      inFlight: inFlight.size,
      batchResponseLimitChars: MAX_BATCH_TOTAL_HTML_CHARS,
    },
  });
}
