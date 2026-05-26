import { fetchAndCompareTickers } from '../lib/market/compare.js';
import { ValoraeEngine, canonicalizeTicker, validarTicker } from '../lib/Valorae-engine.js';
import { sendJson } from '../lib/performance/http.js';
import { beginRoute, boolParam, parseList, clampNumber, resolveSelfScrapeUrl, sendRouteError } from '../lib/http/route.js';

const MAX_COMPARE = Number(process.env.VALORAE_COMPARE_MAX_TICKERS || 12);

export default async function handler(req, res) {
  const route = beginRoute(req, res, { version: ValoraeEngine.version, methods: ['GET', 'POST'], route: 'compare', rateMax: Number(process.env.VALORAE_RATE_LIMIT_COMPARE_MAX || 70), profile: 'compare' });
  if (route.done) return;
  try {
    const q = route.input;
    const raw = parseList(q.tickers || q.ticker).map(x => String(x).trim()).filter(Boolean);
    if (raw.length < 2) return sendJson(req, res, { version: ValoraeEngine.version, requestId: route.requestId, error: 'Envie ao menos dois tickers. Ex: /api/compare?tickers=PETR4,VALE3,PRIO3' }, { status: 400, engineVersion: ValoraeEngine.version, profile: 'compare' });
    if (raw.length > MAX_COMPARE) return sendJson(req, res, { version: ValoraeEngine.version, requestId: route.requestId, error: `Máximo de ${MAX_COMPARE} tickers na comparação.` }, { status: 400, engineVersion: ValoraeEngine.version, profile: 'compare' });
    const tickers = [];
    const errors = [];
    const seen = new Set();
    for (const item of raw) {
      const t = canonicalizeTicker(item);
      const err = validarTicker(t);
      if (err) errors.push({ ticker: item, error: err });
      else if (!seen.has(t)) { seen.add(t); tickers.push(t); }
    }
    if (tickers.length < 2) return sendJson(req, res, { version: ValoraeEngine.version, requestId: route.requestId, error: 'A comparação precisa de pelo menos dois tickers válidos.', errors }, { status: 400, engineVersion: ValoraeEngine.version, profile: 'compare' });
    const data = await fetchAndCompareTickers(tickers, { view: q.view || 'compact', maxConcurrency: clampNumber(q.maxConcurrency || q.concurrency, 4, 1, 6), cache: !boolParam(q.nocache || q.refresh), valoraeScrapeUrl: resolveSelfScrapeUrl(req, q), profile: q.profile || 'portfolio' });
    return sendJson(req, res, { endpoint: 'compare', requestId: route.requestId, inputErrors: errors, ...data }, { status: 200, engineVersion: ValoraeEngine.version, profile: 'compare', cacheControl: 'private, max-age=30, stale-while-revalidate=300' });
  } catch (err) {
    return sendRouteError(req, res, err, { version: ValoraeEngine.version, requestId: route.requestId, profile: 'compare' });
  }
}
