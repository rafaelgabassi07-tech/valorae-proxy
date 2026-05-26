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

export default async function handler(req, res) {
  setCors(res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'Método não permitido. Use GET ou POST.' });
  }

  configureEngine(req);

  const input = req.method === 'GET' ? req.query : (req.body || {});
  const ticker = input.ticker;
  if (!ticker || typeof ticker !== 'string') {
    return res.status(400).json({ error: 'Envie o ticker: GET ?ticker=PETR4 ou POST {"ticker":"PETR4"}' });
  }

  const clean = canonicalizeTicker(ticker);
  const erro = validarTicker(clean);
  if (erro) {
    return res.status(400).json({
      error: erro,
      hint: 'Índices (^IFIX, ^BVSP) não são suportados neste endpoint. Use tickers de ativos: PETR4, VISC11, BOVA11.',
    });
  }

  try {
    const type = input.type || inferAssetType(clean);
    const includeNews = truthy(input.includeNews) || truthy(input.news);
    const result = await NexusEngineUltra.fetchAtivo(clean, type, includeNews);
    if (result?.version) res.setHeader('X-Nexus-Version', result.version);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao processar ativo: ' + (error?.message || String(error)) });
  }
}
