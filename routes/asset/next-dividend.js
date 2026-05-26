import { ValoraeEngine, canonicalizeTicker, inferAssetType, validarTicker } from '../../lib/Valorae-engine.js';
import { sendJson } from '../../lib/performance/http.js';
import { beginRoute, boolParam, resolveSelfScrapeUrl, sendRouteError } from '../../lib/http/route.js';

function parseBRDate(d) { const m = String(d || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00Z`) : null; }

export default async function handler(req, res) {
  const route = beginRoute(req, res, { version: ValoraeEngine.version, methods: ['GET', 'POST'], route: 'asset-next-dividend', rateMax: Number(process.env.VALORAE_RATE_LIMIT_DIVIDENDS_MAX || 90), profile: 'next-dividend' });
  if (route.done) return;
  try {
    const q = route.input;
    const ticker = canonicalizeTicker(q.ticker);
    const err = validarTicker(ticker);
    if (err) return sendJson(req, res, { version: ValoraeEngine.version, requestId: route.requestId, error: err }, { status: 400, engineVersion: ValoraeEngine.version, profile: 'next-dividend' });
    const data = await ValoraeEngine.fetchAtivo(ticker, inferAssetType(ticker), { mode: q.mode || 'super', includeNews: false, view: 'full', cache: !boolParam(q.nocache || q.refresh), bypassCache: boolParam(q.nocache || q.refresh), valoraeScrapeUrl: resolveSelfScrapeUrl(req, q), profile: q.profile || 'standard' });
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const historico = data.results?.dividendos?.historico || data.results?.historicoDividendos || [];
    const upcoming = historico.map(x => ({ ...x, _pag: parseBRDate(x.dataPagamento), _com: parseBRDate(x.dataCom) })).filter(x => x._pag && x._pag >= today).sort((a, b) => a._pag - b._pag);
    const last = historico[0] || null;
    const next = upcoming[0] || null;
    if (next) { delete next._pag; delete next._com; }
    return sendJson(req, res, { version: ValoraeEngine.version, requestId: route.requestId, ticker, type: data.type, nextDividend: next, lastDividend: last, upcomingCount: upcoming.length, quality: data.quality }, { status: 200, engineVersion: ValoraeEngine.version, profile: 'next-dividend', cacheControl: 'private, max-age=30, stale-while-revalidate=300' });
  } catch (err) {
    return sendRouteError(req, res, err, { version: ValoraeEngine.version, requestId: route.requestId, profile: 'next-dividend' });
  }
}
