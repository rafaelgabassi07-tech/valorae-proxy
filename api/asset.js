import { ValoraeEngine, canonicalizeTicker, inferAssetType, validarTicker } from '../lib/Valorae-engine.js';

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

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Método não permitido. Use GET ou POST.' });

  try {
    const input = req.method === 'GET' ? req.query : (req.body || {});
    const rawTicker = input.ticker;
    const ticker = canonicalizeTicker(rawTicker);
    const validation = validarTicker(ticker);
    if (validation) {
      return res.status(400).json({
        version: ValoraeEngine.version,
        error: validation,
        hint: 'Use tickers de ativos, por exemplo PETR4, VALE3, GARE11, VISC11, BOVA11.',
      });
    }

    const type = input.type || inferAssetType(ticker);
    const payload = await ValoraeEngine.fetchAtivo(ticker, type, {
      mode: input.mode || 'super',
      includeNews: boolParam(input.includeNews || input.news),
      newsLimit: Number(input.newsLimit || input.limit || 8),
      useYahooFallback: input.yahoo === undefined ? true : boolParam(input.yahoo),
      timeoutMs: Number(input.timeoutMs || process.env.VALORAE_FETCH_TIMEOUT_MS || 12000),
      maxHtmlChars: Number(input.maxHtmlChars || process.env.VALORAE_MAX_HTML_CHARS || 3200000),
      valoraeScrapeUrl: input.scrapeUrl || `${getBaseUrl(req)}/api/scrape`,
    });

    return res.status(200).json(payload);
  } catch (err) {
    return res.status(500).json({
      version: ValoraeEngine.version,
      status: 'ERROR',
      error: err?.message || 'Erro interno ao processar ativo.',
    });
  }
}
