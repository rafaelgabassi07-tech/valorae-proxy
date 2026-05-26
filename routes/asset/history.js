import { fetchYahooHistory } from '../../lib/market/yahoo.js';
import { ValoraeEngine, canonicalizeTicker, validarTicker } from '../../lib/Valorae-engine.js';
import { sendJson } from '../../lib/performance/http.js';
import { beginRoute, clampNumber, sendRouteError } from '../../lib/http/route.js';

export default async function handler(req, res) {
  const route = beginRoute(req, res, { version: ValoraeEngine.version, methods: ['GET', 'POST'], route: 'asset-history', rateMax: Number(process.env.VALORAE_RATE_LIMIT_HISTORY_MAX || 90), profile: 'history' });
  if (route.done) return;
  try {
    const q = route.input;
    const ticker = canonicalizeTicker(q.ticker);
    const err = validarTicker(ticker);
    if (err) return sendJson(req, res, { version: ValoraeEngine.version, requestId: route.requestId, error: err }, { status: 400, engineVersion: ValoraeEngine.version, profile: 'history' });
    const data = await fetchYahooHistory(ticker, { range: q.range || '1Y', interval: q.interval, timeoutMs: clampNumber(q.timeoutMs, 9000, 1000, 20000) });
    return sendJson(req, res, { version: ValoraeEngine.version, requestId: route.requestId, endpoint: 'asset-history', ...data }, { status: data.ok ? 200 : 502, engineVersion: ValoraeEngine.version, profile: 'history', cacheControl: data.ok ? 'private, max-age=60, stale-while-revalidate=300' : 'no-store' });
  } catch (err) {
    return sendRouteError(req, res, err, { version: ValoraeEngine.version, requestId: route.requestId, profile: 'history' });
  }
}
