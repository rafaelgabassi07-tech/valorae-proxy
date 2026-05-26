// Ranking ao vivo do Investidor10. Funciona como melhoria em relação ao ranking
// por cesta fixa; se a fonte bloquear, os endpoints caem para fallback seguro.

export const INVESTIDOR10_RANKINGS_VERSION = '21.5.13-mature-final-release-free';

const CACHE_TTL_MS = Number(process.env.VALORAE_I10_RANKINGS_CACHE_TTL_MS || 15 * 60 * 1000);
const CACHE_STALE_MS = Number(process.env.VALORAE_I10_RANKINGS_CACHE_STALE_MS || 60 * 60 * 1000);
const cache = new Map();
const inflight = new Map();

function stripTags(input = '') {
  return String(input)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePercent(raw = '') {
  const m = String(raw).match(/[+-]?\d{1,3}(?:\.\d{3})*(?:,\d+)?\s*%|[+-]?\d+(?:\.\d+)?\s*%/);
  return m ? m[0].replace('.', '').replace('.', '').trim() : '';
}

function parseMoney(raw = '') {
  const m = String(raw).match(/R\$\s*[+-]?\d{1,3}(?:\.\d{3})*(?:,\d+)?|[+-]?\d{1,3}(?:\.\d{3})*,\d{2}/);
  return m ? m[0].trim() : '';
}

function uniqueRows(rows = [], limit = 15) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const t = String(r.ticker || '').toUpperCase();
    if (!/^[A-Z]{4}\d{1,2}F?$/.test(t) || seen.has(t)) continue;
    seen.add(t);
    out.push({ ...r, ticker: t });
    if (out.length >= limit) break;
  }
  return out;
}

function extractSection(html, needles = []) {
  const lower = html.toLowerCase();
  let idx = -1;
  for (const n of needles) {
    idx = lower.indexOf(String(n).toLowerCase());
    if (idx >= 0) break;
  }
  if (idx < 0) return html;
  return html.slice(Math.max(0, idx), Math.min(html.length, idx + 14000));
}

function parseRankingRows(sectionHtml, direction) {
  const rows = [];
  const linkRe = /<a\b[^>]*href=["'][^"']*\/acoes\/([a-z0-9]+)\/?[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = linkRe.exec(sectionHtml))) {
    const ticker = String(m[1] || '').toUpperCase();
    const ctx = sectionHtml.slice(Math.max(0, m.index - 700), Math.min(sectionHtml.length, linkRe.lastIndex + 900));
    rows.push({
      ticker,
      nome: stripTags(m[2]).replace(ticker, '').trim() || undefined,
      variacao: parsePercent(ctx),
      preco: parseMoney(ctx),
      direction,
      source: 'Investidor10',
    });
  }
  return uniqueRows(rows);
}

export function parseInvestidor10RankingsHtml(html = '') {
  const source = String(html || '');
  const altasSection = extractSection(source, ['maioresAltas', 'Maiores Altas', 'maiores altas']);
  const baixasSection = extractSection(source, ['maioresBaixas', 'Maiores Baixas', 'maiores baixas']);
  let altas = parseRankingRows(altasSection, 'alta');
  let baixas = parseRankingRows(baixasSection, 'baixa');

  // Fallback mais amplo quando as classes mudarem: pega todos os links próximos a percentuais.
  if (!altas.length || !baixas.length) {
    const all = parseRankingRows(source, 'unknown');
    const withPct = all.map(r => ({ ...r, numericVariation: Number(String(r.variacao || '').replace('%','').replace('.','').replace(',','.')) }))
      .filter(r => Number.isFinite(r.numericVariation));
    if (!altas.length) altas = uniqueRows(withPct.filter(r => r.numericVariation >= 0).sort((a, b) => b.numericVariation - a.numericVariation).map(r => ({ ...r, direction: 'alta' })));
    if (!baixas.length) baixas = uniqueRows(withPct.filter(r => r.numericVariation < 0).sort((a, b) => a.numericVariation - b.numericVariation).map(r => ({ ...r, direction: 'baixa' })));
  }
  return { altas, baixas };
}

async function fetchHtml(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': process.env.VALORAE_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
        'Cache-Control': 'no-cache',
      },
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, url, html: text, length: text.length };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchInvestidor10Rankings({ timeoutMs = 9000, bypassCache = false } = {}) {
  const key = 'i10-rankings-v2';
  const hit = cache.get(key);
  if (!bypassCache && hit && hit.expiresAt > Date.now()) return { ...hit.data, cache: 'HIT' };
  if (!bypassCache && inflight.has(key)) return inflight.get(key);

  const promise = (async () => {
    const urls = ['https://investidor10.com.br/', 'https://investidor10.com.br/acoes/'];
    const attempts = [];
    let lastError = null;
    for (const url of urls) {
      try {
        const fetched = await fetchHtml(url, timeoutMs);
        attempts.push({ url, ok: fetched.ok, status: fetched.status, length: fetched.length });
        if (!fetched.ok) throw new Error(`Investidor10 HTTP ${fetched.status}`);
        const rankings = parseInvestidor10RankingsHtml(fetched.html);
        if (rankings.altas.length || rankings.baixas.length) {
          const data = { ok: true, source: 'Investidor10RankingsHTML', version: INVESTIDOR10_RANKINGS_VERSION, generatedAt: new Date().toISOString(), rankings, attempts };
          cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS, staleUntil: Date.now() + CACHE_TTL_MS + CACHE_STALE_MS });
          return { ...data, cache: 'MISS' };
        }
        lastError = new Error('HTML recebido, mas rankings não foram encontrados.');
      } catch (err) {
        lastError = err;
        attempts.push({ url, ok: false, error: err?.message || 'Erro desconhecido' });
      }
    }
    const stale = cache.get(key);
    if (!bypassCache && stale && stale.staleUntil > Date.now()) {
      return { ...stale.data, cache: 'STALE_IF_ERROR', warning: lastError?.message || 'Rankings ao vivo indisponíveis', attempts };
    }
    return { ok: false, source: 'Investidor10RankingsHTML', version: INVESTIDOR10_RANKINGS_VERSION, generatedAt: new Date().toISOString(), rankings: { altas: [], baixas: [] }, attempts, error: lastError?.message || 'Rankings indisponíveis', cache: 'MISS' };
  })();

  inflight.set(key, promise);
  try { return await promise; } finally { inflight.delete(key); }
}
