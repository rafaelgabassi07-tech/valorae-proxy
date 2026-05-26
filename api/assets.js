import { NexusEngineUltra, inferAssetType, canonicalizeTicker, validarTicker } from '../lib/nexus-engine.js';
import { configureEngineForRequest, numberEnv, sendMethodNotAllowed, setCors, truthy } from '../lib/vercel-runtime.js';

// Protege contra abuso e contra fan-out excessivo no Vercel.
const MAX_TICKERS = numberEnv('MAX_TICKERS_PER_REQUEST', 20, { min: 1, max: 50 });

export default async function handler(req, res) {
  setCors(res, 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  configureEngineForRequest(NexusEngineUltra, req);

  let rawTickers = [];
  const input = req.method === 'GET' ? req.query : (req.body || {});

  if (req.method === 'GET') {
    const param = input.tickers || input.ticker || '';
    rawTickers = String(param).split(',').map(t => t.trim()).filter(Boolean);
  } else if (req.method === 'POST') {
    if (Array.isArray(input?.tickers)) rawTickers = input.tickers;
    else if (typeof input?.tickers === 'string') rawTickers = input.tickers.split(',').map(t => t.trim()).filter(Boolean);
  } else {
    return sendMethodNotAllowed(res, 'GET, POST, OPTIONS');
  }

  rawTickers = [...new Set(rawTickers.map(t => String(t).trim()).filter(Boolean))];

  if (rawTickers.length === 0) {
    return res.status(400).json({
      error: 'Envie ao menos um ticker.',
      hint: 'GET /api/assets?tickers=PETR4,VISC11 ou POST {"tickers":["PETR4","VISC11"]}',
    });
  }

  if (rawTickers.length > MAX_TICKERS) {
    return res.status(400).json({ error: `Máximo de ${MAX_TICKERS} tickers por requisição. Enviados: ${rawTickers.length}.` });
  }

  const valid = [];
  const errors = [];

  for (const raw of rawTickers) {
    const clean = canonicalizeTicker(raw);
    const erro = validarTicker(clean);
    if (erro) errors.push({ ticker: raw, error: erro });
    else valid.push({ ticker: clean, type: input.type ? String(input.type).toUpperCase() : inferAssetType(clean) });
  }

  const mode = String(input.mode || '').toLowerCase();
  const includeNews = truthy(input.includeNews) || truthy(input.news) || mode === 'full' || mode === 'super';

  try {
    // Usa o batch real do engine, que limita concorrência e aproveita /api/batch-scrape quando configurado.
    const batch = await NexusEngineUltra.fetchAtivosBatch(valid, includeNews);
    const assets = [];

    batch.forEach((item, i) => {
      if (item instanceof Error) errors.push({ ticker: valid[i]?.ticker, error: item.message });
      else if (item?.error) errors.push({ ticker: item.ticker || valid[i]?.ticker, error: item.error });
      else assets.push(item);
    });

    return res.status(200).json({ count: assets.length, assets, errors: errors.length ? errors : undefined });
  } catch (error) {
    return res.status(500).json({ error: 'Erro no batch: ' + (error?.message || String(error)), errors });
  }
}
