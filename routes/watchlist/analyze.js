import { ValoraeEngine, canonicalizeTicker, validarTicker } from '../../lib/Valorae-engine.js';
import { buildValoraeScore } from '../../lib/quality/valorae-score.js';
import { sendJson } from '../../lib/performance/http.js';
import { beginRoute, boolParam, parseList, clampNumber, resolveSelfScrapeUrl, sendRouteError } from '../../lib/http/route.js';

const MAX_TICKERS = Number(process.env.VALORAE_WATCHLIST_MAX_TICKERS || 30);

export default async function handler(req, res) {
  const route = beginRoute(req, res, { version: ValoraeEngine.version, methods: ['GET', 'POST'], route: 'watchlist-analyze', rateMax: Number(process.env.VALORAE_RATE_LIMIT_WATCHLIST_MAX || 70), profile: 'watchlist' });
  if (route.done) return;
  try {
    const q = route.input;
    const raw = parseList(q.tickers || q.ticker).map(String).map(s => s.trim()).filter(Boolean);
    if (!raw.length) return sendJson(req, res, { version: ValoraeEngine.version, requestId: route.requestId, error: 'Envie tickers=PETR4,GARE11' }, { status: 400, engineVersion: ValoraeEngine.version, profile: 'watchlist' });
    if (raw.length > MAX_TICKERS) return sendJson(req, res, { version: ValoraeEngine.version, requestId: route.requestId, error: `Máximo de ${MAX_TICKERS} tickers.` }, { status: 400, engineVersion: ValoraeEngine.version, profile: 'watchlist' });
    const tickers = [];
    const errors = [];
    const seen = new Set();
    for (const item of raw) {
      const t = canonicalizeTicker(item);
      const err = validarTicker(t);
      if (err) errors.push({ ticker: item, error: err });
      else if (!seen.has(t)) { seen.add(t); tickers.push(t); }
    }
    if (!tickers.length) return sendJson(req, res, { version: ValoraeEngine.version, requestId: route.requestId, error: 'Nenhum ticker válido enviado.', errors }, { status: 400, engineVersion: ValoraeEngine.version, profile: 'watchlist' });
    const batch = await ValoraeEngine.fetchAtivosBatch(tickers, { mode: q.mode || 'super', includeNews: boolParam(q.includeNews || q.news), view: q.view || 'compact', includeQuality: true, maxConcurrency: clampNumber(q.maxConcurrency, 4, 1, 6), cache: !boolParam(q.nocache || q.refresh), bypassCache: boolParam(q.nocache || q.refresh), valoraeScrapeUrl: resolveSelfScrapeUrl(req, q), profile: q.profile || 'portfolio' });
    const items = batch.assets.map(a => ({
      ticker: a.ticker,
      type: a.type,
      name: a.results?.nome || a.results?.dadosEmpresa?.nomeCompleto || a.ticker,
      price: a.results?.cotacao?.precoAtual || a.results?.precoAtual,
      dy: a.results?.indicadores?.dividendYield || a.results?.dividendos?.dividendYield || a.results?.dividendYield,
      pvp: a.results?.indicadores?.pvp || a.results?.pvp,
      pl: a.results?.indicadores?.pl || a.results?.pl,
      quality: a.quality,
      valoraeScore: a.valoraeScore || buildValoraeScore(a),
      alerts: [...(a.validation?.suspicious || []), ...(a.warnings || [])].slice(0, 5),
    }));
    items.sort((a, b) => Number(b.valoraeScore?.value || 0) - Number(a.valoraeScore?.value || 0));
    return sendJson(req, res, { version: ValoraeEngine.version, requestId: route.requestId, endpoint: 'watchlist-analyze', count: items.length, items, stats: batch.stats, errors: [...errors, ...batch.errors] }, { status: 200, engineVersion: ValoraeEngine.version, profile: 'watchlist', cacheControl: 'private, max-age=30, stale-while-revalidate=300' });
  } catch (err) {
    return sendRouteError(req, res, err, { version: ValoraeEngine.version, requestId: route.requestId, profile: 'watchlist' });
  }
}
