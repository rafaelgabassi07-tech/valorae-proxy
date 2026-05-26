export function truthy(v) {
  return v === true || v === 'true' || v === '1' || v === 'yes' || v === 'sim' || v === 'on';
}

export function numberEnv(name, fallback, { min, max } = {}) {
  const raw = process.env?.[name];
  const n = raw == null || raw === '' ? fallback : Number(raw);
  const safe = Number.isFinite(n) ? n : fallback;
  return Math.min(max ?? safe, Math.max(min ?? safe, safe));
}

export function setCors(res, methods = 'GET, POST, OPTIONS') {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ALLOW_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Cache-Version, Authorization');
}

export function getRequestBaseUrl(req) {
  const protoHeader = req.headers?.['x-forwarded-proto'];
  const hostHeader = req.headers?.['x-forwarded-host'] || req.headers?.host;
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : (protoHeader || 'https');
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  return host ? `${proto}://${host}` : '';
}

export function configureEngineForRequest(NexusEngineUltra, req) {
  const baseUrl = getRequestBaseUrl(req);
  const envProxyUrl = process.env.NEXUS_PROXY_URL || '';
  const envBatchUrl = process.env.NEXUS_PROXY_BATCH_URL || '';

  // Por padrão, endpoints /api/asset e /api/assets fazem fetch direto e evitam
  // chamar outro endpoint serverless do mesmo deploy. Ative o proxy interno só
  // se quiser cache/coalescing via /api/scrape, aceitando a duplicação de invocações.
  const useInternalProxy = truthy(process.env.NEXUS_USE_INTERNAL_PROXY);
  const useBatchProxy = truthy(process.env.NEXUS_USE_BATCH_PROXY);

  const proxyUrl = envProxyUrl || (useInternalProxy && baseUrl ? `${baseUrl}/api/scrape` : '');
  const batchUrl = envBatchUrl || (useBatchProxy && baseUrl ? `${baseUrl}/api/batch-scrape` : '');

  NexusEngineUltra.configure({
    useNexusProxy: Boolean(proxyUrl),
    nexusProxyUrl: proxyUrl,
    nexusProxyBatchUrl: batchUrl,
    fetchTimeoutMs: numberEnv('FETCH_TIMEOUT_MS', 15000, { min: 3000, max: 55000 }),
    nexusProxyTimeoutMs: numberEnv('NEXUS_PROXY_TIMEOUT_MS', numberEnv('FETCH_TIMEOUT_MS', 12000, { min: 3000, max: 55000 }), { min: 3000, max: 55000 }),
    concurrencyLimit: numberEnv('NEXUS_CONCURRENCY', 4, { min: 1, max: 8 }),
    domainRps: numberEnv('NEXUS_DOMAIN_RPS', 2, { min: 0.2, max: 10 }),
    domainBurst: numberEnv('NEXUS_DOMAIN_BURST', 5, { min: 1, max: 20 }),
  });

  return { baseUrl, proxyUrl, batchUrl };
}

export function sendMethodNotAllowed(res, methods = 'GET, POST, OPTIONS') {
  res.setHeader('Allow', methods.replace(/,\s*OPTIONS/g, ''));
  return res.status(405).json({ error: `Método não permitido. Use ${methods.replace(', OPTIONS', '')}.` });
}
