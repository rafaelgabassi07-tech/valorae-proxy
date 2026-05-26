import { ValoraeEngine } from './lib/Valorae-engine.js';

const MAX_JOBS = Number(process.env.VALORAE_MAX_BATCH_JOBS || 20);
const MAX_CONCURRENCY = Number(process.env.VALORAE_BATCH_SCRAPE_CONCURRENCY || 4);

function cors(req, res) {
  const origin = process.env.CORS_ALLOW_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
  res.setHeader('Cache-Control', 'no-store');
}

function boolParam(v) {
  return ['1', 'true', 'yes', 'sim', 'on'].includes(String(v || '').toLowerCase());
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ version: ValoraeEngine.version, error: 'Método não permitido. Use POST.' });

  const jobs = Array.isArray(req.body?.jobs) ? req.body.jobs : [];
  if (!jobs.length) {
    return res.status(400).json({
      version: ValoraeEngine.version,
      error: 'Envie jobs: [{ "id": "petr4", "url": "https://investidor10.com.br/acoes/petr4/" }]',
    });
  }
  if (jobs.length > MAX_JOBS) {
    return res.status(400).json({ version: ValoraeEngine.version, error: `Máximo de ${MAX_JOBS} jobs por requisição.` });
  }

  const includeHtml = boolParam(req.body?.includeHtml || req.body?.returnHtml || req.body?.html);
  const timeoutMs = Number(req.body?.timeoutMs || process.env.VALORAE_FETCH_TIMEOUT_MS || 12000);
  const maxChars = Number(req.body?.maxHtmlChars || process.env.VALORAE_MAX_HTML_CHARS || 3200000);
  const concurrency = Math.max(1, Math.min(Number(req.body?.concurrency || MAX_CONCURRENCY), MAX_CONCURRENCY, jobs.length));

  const results = new Array(jobs.length);
  let cursor = 0;
  async function worker() {
    while (cursor < jobs.length) {
      const index = cursor++;
      const job = jobs[index] || {};
      const id = job.id || String(index);
      const url = job.url;
      try {
        if (!url || typeof url !== 'string') throw new Error('Job sem URL válida.');
        const result = await ValoraeEngine.scrapeUrl(url, {
          provider: 'direct',
          timeoutMs,
          maxChars,
          cache: job.cache !== undefined ? boolParam(job.cache) : true,
        });
        results[index] = {
          id,
          index,
          success: result.ok,
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
          html: includeHtml ? result.html : undefined,
        };
      } catch (err) {
        results[index] = { id, index, success: false, ok: false, status: 500, error: err?.message || 'Erro no batch scrape.' };
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return res.status(200).json({ version: ValoraeEngine.version, count: results.length, results });
}
