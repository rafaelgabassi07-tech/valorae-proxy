import { ValoraeEngine, canonicalizeTicker, validarTicker } from './lib/Valorae-engine.js';

const MAX_TICKERS = Number(process.env.MAX_TICKERS_PER_REQUEST || 20);

function cors(req, res) {
  const origin = process.env.CORS_ALLOW_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
}

function boolParam(v) {
  return ['1', 'true', 'yes', 'sim', 'on'].includes(String(v || '').toLowerCase());
}

function getBaseUrl(req) {
  const explicit = process.env.VALORAE_PUBLIC_BASE_URL || process.env.PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`.replace(/\/$/, '');
}

function parseTickers(input) {
  if (Array.isArray(input)) return input;
  if (typeof input === 'string') return input.split(',');
  return [];
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Método não permitido. Use GET ou POST.' });

  const input = req.method === 'GET' ? req.query : (req.body || {});
  const raw = parseTickers(input.tickers || input.ticker).map(t => String(t).trim()).filter(Boolean);

  if (!raw.length) {
    return res.status(400).json({
      version: ValoraeEngine.version,
      error: 'Envie ao menos um ticker.',
      hint: 'GET /api/assets?tickers=PETR4,GARE11 ou POST { "tickers": ["PETR4", "GARE11"] }',
    });
  }
  if (raw.length > MAX_TICKERS) {
    return res.status(400).json({ version: ValoraeEngine.version, error: `Máximo de ${MAX_TICKERS} tickers por requisição.` });
  }

  const valid = [];
  const errors = [];
  for (const r of raw) {
    const t = canonicalizeTicker(r);
    const err = validarTicker(t);
    if (err) errors.push({ ticker: r, error: err });
    else valid.push(t);
  }

  const batch = await ValoraeEngine.fetchAtivosBatch(valid, {
    mode: input.mode || 'super',
    includeNews: boolParam(input.includeNews || input.news),
    newsLimit: Number(input.newsLimit || input.limit || 8),
    useYahooFallback: input.yahoo === undefined ? true : boolParam(input.yahoo),
    concurrency: Number(input.concurrency || process.env.VALORAE_BATCH_CONCURRENCY || 4),
    timeoutMs: Number(input.timeoutMs || process.env.VALORAE_FETCH_TIMEOUT_MS || 12000),
    maxHtmlChars: Number(input.maxHtmlChars || process.env.VALORAE_MAX_HTML_CHARS || 3200000),
    valoraeScrapeUrl: input.scrapeUrl || `${getBaseUrl(req)}/api/scrape`,
  });

  return res.status(200).json({
    version: ValoraeEngine.version,
    count: batch.assets.length,
    assets: batch.assets,
    errors: [...errors, ...batch.errors],
  });
}
