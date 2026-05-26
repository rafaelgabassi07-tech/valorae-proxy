import { ValoraeEngine } from './lib/Valorae-engine.js';

function cors(req, res) {
  const origin = process.env.CORS_ALLOW_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
  res.setHeader('Cache-Control', 'no-store');
}

function boolParam(v) {
  return ['1', 'true', 'yes', 'sim', 'on'].includes(String(v || '').toLowerCase());
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Método não permitido. Use GET ou POST.' });

  const input = req.method === 'GET' ? req.query : (req.body || {});
  const url = input.url;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({
      version: ValoraeEngine.version,
      error: 'Envie uma URL HTTPS permitida.',
      example: '/api/scrape?url=https://investidor10.com.br/acoes/petr4/&includeHtml=0',
    });
  }

  try {
    const result = await ValoraeEngine.scrapeUrl(url, {
      provider: 'direct',
      timeoutMs: Number(input.timeoutMs || process.env.VALORAE_FETCH_TIMEOUT_MS || 12000),
      maxChars: Number(input.maxHtmlChars || process.env.VALORAE_MAX_HTML_CHARS || 3200000),
      cache: input.cache === undefined ? true : boolParam(input.cache),
    });
    const includeHtml = boolParam(input.includeHtml || input.html || input.returnHtml);
    return res.status(200).json({
      version: ValoraeEngine.version,
      ok: result.ok,
      status: result.status,
      blocked: result.blocked,
      error: result.error,
      url: result.url,
      finalUrl: result.finalUrl,
      hostname: result.hostname,
      contentType: result.contentType,
      htmlLength: result.htmlLength,
      provider: result.provider,
      selectorResultKeys: result.selectorResultKeys || [],
      results: result.selectorResults || {},
      elapsedMs: result.elapsedMs,
      cache: result.cache,
      htmlPreview: result.html ? result.html.slice(0, 800) : '',
      html: includeHtml ? result.html : undefined,
    });
  } catch (err) {
    return res.status(500).json({ version: ValoraeEngine.version, ok: false, error: err?.message || 'Erro interno no scrape.' });
  }
}
