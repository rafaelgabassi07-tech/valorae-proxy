import { ValoraeEngine, canonicalizeTicker, validarTicker } from '../../lib/Valorae-engine.js';
import { sendJson } from '../../lib/performance/http.js';
import { beginRoute, boolParam, parseList, clampNumber, resolveSelfScrapeUrl, sendRouteError } from '../../lib/http/route.js';

const MAX_TICKERS = Number(process.env.VALORAE_PORTFOLIO_DIVIDENDS_MAX_TICKERS || 30);
function parseBRDate(d) { const m = String(d || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00Z`) : null; }

export default async function handler(req, res) {
  const route = beginRoute(req, res, { version: ValoraeEngine.version, methods: ['GET', 'POST'], route: 'portfolio-next-dividends', rateMax: Number(process.env.VALORAE_RATE_LIMIT_PORTFOLIO_MAX || 60), profile: 'portfolio' });
  if (route.done) return;
  try {
    const q = route.input;
    const raw = parseList(q.tickers || q.ticker).map(String).map(s => s.trim()).filter(Boolean);
    if (!raw.length) return sendJson(req, res, { version: ValoraeEngine.version, requestId: route.requestId, error: 'Envie tickers=PETR4,GARE11' }, { status: 400, engineVersion: ValoraeEngine.version, profile: 'portfolio' });
    if (raw.length > MAX_TICKERS) return sendJson(req, res, { version: ValoraeEngine.version, requestId: route.requestId, error: `Máximo de ${MAX_TICKERS} tickers.` }, { status: 400, engineVersion: ValoraeEngine.version, profile: 'portfolio' });
    const tickers = [];
    const inputErrors = [];
    for (const item of raw) {
      const t = canonicalizeTicker(item);
      const err = validarTicker(t);
      if (err) inputErrors.push({ ticker: item, error: err }); else tickers.push(t);
    }
    const batch = await ValoraeEngine.fetchAtivosBatch(tickers, { mode: q.mode || 'super', includeNews: false, view: 'full', maxConcurrency: clampNumber(q.maxConcurrency || q.concurrency, 4, 1, 6), cache: !boolParam(q.nocache || q.refresh), valoraeScrapeUrl: resolveSelfScrapeUrl(req, q), profile: q.profile || 'portfolio' });
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const items = batch.assets.map(a => {
      const historico = a.results?.dividendos?.historico || a.results?.historicoDividendos || [];
      const upcoming = historico.map(x => ({ ...x, _pag: parseBRDate(x.dataPagamento), _com: parseBRDate(x.dataCom) })).filter(x => x._pag && x._pag >= today).sort((x, y) => x._pag - y._pag);
      const next = upcoming[0] || null;
      if (next) { delete next._pag; delete next._com; }
      return { ticker: a.ticker, type: a.type, nextDividend: next, lastDividend: historico[0] || null, upcomingCount: upcoming.length, quality: a.quality?.score };
    });
    return sendJson(req, res, { version: ValoraeEngine.version, requestId: route.requestId, endpoint: 'portfolio-next-dividends', count: items.length, items, stats: batch.stats, errors: [...inputErrors, ...batch.errors] }, { status: 200, engineVersion: ValoraeEngine.version, profile: 'portfolio', cacheControl: 'private, max-age=30, stale-while-revalidate=300' });
  } catch (err) {
    return sendRouteError(req, res, err, { version: ValoraeEngine.version, requestId: route.requestId, profile: 'portfolio' });
  }
}
