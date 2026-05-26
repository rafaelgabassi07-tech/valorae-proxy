import { NexusEngineUltra, inferAssetType, canonicalizeTicker, validarTicker } from './lib/nexus-engine.js';

function truthy(v) {
  return v === true || v === 'true' || v === '1' || v === 'yes' || v === 'sim' || v === 'on';
}

function numberEnv(name, fallback, { min, max } = {}) {
  const raw = process.env?.[name];
  const n = raw == null || raw === '' ? fallback : Number(raw);
  const safe = Number.isFinite(n) ? n : fallback;
  return Math.min(max ?? safe, Math.max(min ?? safe, safe));
}

function setCors(res, methods = 'GET, POST, OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ALLOW_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Cache-Version, Authorization');
}

function getRequestBaseUrl(req) {
  const protoHeader = req.headers?.['x-forwarded-proto'];
  const hostHeader = req.headers?.['x-forwarded-host'] || req.headers?.host;
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : (protoHeader || 'https');
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  return host ? `${proto}://${host}` : '';
}

function configureEngine(req) {
  const baseUrl = getRequestBaseUrl(req);
  const useInternalProxy = truthy(process.env.NEXUS_USE_INTERNAL_PROXY);
  NexusEngineUltra.configure({
    useNexusProxy: useInternalProxy,
    nexusProxyUrl: process.env.NEXUS_PROXY_URL || (useInternalProxy && baseUrl ? `${baseUrl}/api/scrape` : ''),
    nexusProxyBatchUrl: process.env.NEXUS_PROXY_BATCH_URL || '',
    fetchTimeoutMs: numberEnv('FETCH_TIMEOUT_MS', 15_000, { min: 3000, max: 55_000 }),
    nexusProxyTimeoutMs: numberEnv('NEXUS_PROXY_TIMEOUT_MS', 12_000, { min: 3000, max: 55_000 }),
    concurrencyLimit: numberEnv('NEXUS_CONCURRENCY_LIMIT', 5, { min: 1, max: 10 }),
    domainRps: numberEnv('NEXUS_DOMAIN_RPS', 2, { min: 0.2, max: 10 }),
    domainBurst: numberEnv('NEXUS_DOMAIN_BURST', 5, { min: 1, max: 20 }),
  });
}

const MAX_TICKERS = numberEnv('MAX_TICKERS_PER_REQUEST', 20, { min: 1, max: 50 });

export default async function handler(req, res) {
  setCors(res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'Método não permitido. Use GET ou POST.' });
  }

  configureEngine(req);

  const input = req.method === 'GET' ? req.query : (req.body || {});
  let rawTickers = [];

  if (req.method === 'GET') {
    const param = input.tickers || input.ticker || '';
    rawTickers = String(param).split(',').map(t => t.trim()).filter(Boolean);
  } else if (Array.isArray(input?.tickers)) {
    rawTickers = input.tickers;
  } else if (typeof input?.tickers === 'string') {
    rawTickers = input.tickers.split(',').map(t => t.trim()).filter(Boolean);
  }

  if (rawTickers.length === 0) {
    return res.status(400).json({
      error: 'Envie ao menos um ticker.',
      hint: 'GET /api/assets?tickers=PETR4,VISC11 ou POST { "tickers": ["PETR4", "VISC11"] }',
    });
  }

  if (rawTickers.length > MAX_TICKERS) {
    return res.status(400).json({ error: `Máximo de ${MAX_TICKERS} tickers por requisição. Enviados: ${rawTickers.length}.` });
  }

  const valid = [];
  const errors = [];
  for (const raw of rawTickers) {
    const clean = canonicalizeTicker(String(raw));
    const erro = validarTicker(clean);
    if (erro) errors.push({ ticker: raw, error: erro });
    else valid.push({ ticker: clean, type: inferAssetType(clean) });
  }

  const includeNews = truthy(input.includeNews) || truthy(input.news);
  let assets = [];

  if (valid.length > 0) {
    const results = await NexusEngineUltra.fetchAtivosBatch(valid, includeNews);
    for (let i = 0; i < results.length; i++) {
      const out = results[i];
      if (out instanceof Error) errors.push({ ticker: valid[i].ticker, error: out.message });
      else if (out?.metrics?.error && out.cacheStatus === 'ERROR') errors.push({ ticker: valid[i].ticker, error: out.metrics.error });
      else assets.push(out);
    }
  }

  return res.status(200).json({ count: assets.length, assets, errors: errors.length ? errors : undefined });
}
