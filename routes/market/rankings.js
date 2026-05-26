import { fetchAndCompareTickers } from '../../lib/market/compare.js';
import { fetchInvestidor10Rankings } from '../../lib/market/rankings-i10.js';
import { ValoraeEngine, canonicalizeTicker, validarTicker } from '../../lib/Valorae-engine.js';
import { sendJson } from '../../lib/performance/http.js';
import { beginRoute, boolParam, parseList, clampNumber, resolveSelfScrapeUrl, sendRouteError } from '../../lib/http/route.js';

const DEFAULTS = { ACAO: ['PETR4','VALE3','ITUB4','BBAS3','PRIO3','WEGE3'], FII: ['GARE11','HGLG11','TRXF11','MXRF11','KNRI11','VISC11'] };
const MAX_RANKING = Number(process.env.VALORAE_RANKING_MAX_TICKERS || 15);

export default async function handler(req, res) {
  const route = beginRoute(req, res, { version: ValoraeEngine.version, methods: ['GET', 'POST'], route: 'market-rankings', rateMax: Number(process.env.VALORAE_RATE_LIMIT_MARKET_MAX || 90), profile: 'market' });
  if (route.done) return;
  try {
    const q = route.input;
    const kind = String(q.type || q.kind || 'ACAO').toUpperCase();
    const sourceMode = String(q.source || 'auto').toLowerCase();
    const source = parseList(q.tickers).map(x => String(x).trim()).filter(Boolean);
    // Fraqueza antiga do Valorae: ranking por cesta fixa.
    // Agora tenta ranking ao vivo do Investidor10 e cai para comparação por fundamentos se houver WAF/bloqueio.
    if (!source.length && kind === 'ACAO' && sourceMode !== 'compare') {
      const live = await fetchInvestidor10Rankings({ bypassCache: boolParam(q.nocache || q.refresh), timeoutMs: clampNumber(q.timeoutMs, 9000, 1000, 20000) });
      if (live.ok && (live.rankings?.altas?.length || live.rankings?.baixas?.length)) {
        return sendJson(req, res, {
          version: ValoraeEngine.version,
          requestId: route.requestId,
          endpoint: 'market-rankings',
          type: kind,
          rankingSource: 'investidor10-live',
          fallbackUsed: false,
          ...live,
        }, { status: 200, engineVersion: ValoraeEngine.version, profile: 'market', cacheControl: 'private, max-age=60, stale-while-revalidate=300' });
      }
      if (sourceMode === 'live') {
        return sendJson(req, res, { version: ValoraeEngine.version, requestId: route.requestId, endpoint: 'market-rankings', type: kind, rankingSource: 'investidor10-live', fallbackUsed: false, ...live }, { status: 502, engineVersion: ValoraeEngine.version, profile: 'market', cacheControl: 'no-store' });
      }
    }
    const raw = source.length ? source : (DEFAULTS[kind] || DEFAULTS.ACAO);
    if (raw.length > MAX_RANKING) return sendJson(req, res, { version: ValoraeEngine.version, requestId: route.requestId, error: `Máximo de ${MAX_RANKING} tickers no ranking.` }, { status: 400, engineVersion: ValoraeEngine.version, profile: 'market' });
    const list = [];
    const errors = [];
    for (const item of raw) {
      const t = canonicalizeTicker(item);
      const err = validarTicker(t);
      if (err) errors.push({ ticker: item, error: err });
      else list.push(t);
    }
    const data = await fetchAndCompareTickers(list, { view: 'compact', maxConcurrency: clampNumber(q.maxConcurrency, 4, 1, 6), cache: !boolParam(q.nocache || q.refresh), valoraeScrapeUrl: resolveSelfScrapeUrl(req, q), profile: q.profile || 'portfolio' });
    return sendJson(req, res, { version: ValoraeEngine.version, requestId: route.requestId, endpoint: 'market-rankings', type: kind, rankingSource: 'valorae-compare-fallback', fallbackUsed: !source.length && sourceMode !== 'compare', inputErrors: errors, ...data }, { status: 200, engineVersion: ValoraeEngine.version, profile: 'market', cacheControl: 'private, max-age=60, stale-while-revalidate=300' });
  } catch (err) {
    return sendRouteError(req, res, err, { version: ValoraeEngine.version, requestId: route.requestId, profile: 'market' });
  }
}
