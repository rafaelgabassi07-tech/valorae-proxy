import { ValoraeEngine, canonicalizeTicker, validarTicker } from '../lib/Valorae-engine.js';
import { sendJson } from '../lib/performance/http.js';
import { beginRoute, clampNumber, sendRouteError } from '../lib/http/route.js';

export default async function handler(req, res) {
  const route = beginRoute(req, res, { version: ValoraeEngine.version, methods: ['GET'], route: 'news', rateMax: Number(process.env.VALORAE_RATE_LIMIT_NEWS_MAX || 90), profile: 'news' });
  if (route.done) return;
  try {
    const input = route.input;
    const ticker = canonicalizeTicker(input.ticker);
    const validation = validarTicker(ticker);
    if (validation) return sendJson(req, res, { version: ValoraeEngine.version, requestId: route.requestId, error: validation }, { status: 400, engineVersion: ValoraeEngine.version, profile: 'news' });
    const aliases = typeof input.aliases === 'string' ? input.aliases.split(',').map(s => s.trim()).filter(Boolean).slice(0, 8) : [];
    const news = await ValoraeEngine.fetchNews(ticker, aliases, { limit: clampNumber(input.limit, 8, 1, 25) });
    return sendJson(req, res, { version: ValoraeEngine.version, requestId: route.requestId, ticker, ...news }, { status: 200, engineVersion: ValoraeEngine.version, profile: 'news', cacheControl: 'private, max-age=60, stale-while-revalidate=300' });
  } catch (err) {
    return sendRouteError(req, res, err, { version: ValoraeEngine.version, requestId: route.requestId, profile: 'news' });
  }
}
