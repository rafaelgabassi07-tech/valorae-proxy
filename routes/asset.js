import { ValoraeEngine, canonicalizeTicker, inferAssetType, validarTicker } from '../lib/Valorae-engine.js';
import { resolvePerformanceOptions } from '../lib/performance/profile.js';
import { sendJson } from '../lib/performance/http.js';
import { beginRoute, boolParam, falseParam, clampNumber, resolveSelfScrapeUrl, sendRouteError } from '../lib/http/route.js';

export default async function handler(req, res) {
  const route = beginRoute(req, res, {
    version: ValoraeEngine.version,
    methods: ['GET', 'POST'],
    route: 'asset',
    rateMax: Number(process.env.VALORAE_RATE_LIMIT_ASSET_MAX || 120),
    profile: 'asset',
  });
  if (route.done) return;
  const input = route.input;

  try {
    const ticker = canonicalizeTicker(input.ticker);
    const validation = validarTicker(ticker);
    if (validation) {
      return sendJson(req, res, {
        version: ValoraeEngine.version,
        requestId: route.requestId,
        error: validation,
        hint: 'Use tickers de ativos, por exemplo PETR4, VALE3, GARE11, VISC11, BOVA11.',
      }, { status: 400, engineVersion: ValoraeEngine.version, profile: 'asset' });
    }

    const type = input.type || inferAssetType(ticker);
    const view = input.view || 'full';
    const perfOptions = resolvePerformanceOptions({
      mode: input.mode || 'super',
      includeNews: boolParam(input.includeNews ?? input.news, false),
      newsLimit: clampNumber(input.newsLimit || input.limit, 8, 0, 25),
      useYahooFallback: input.yahoo === undefined ? true : boolParam(input.yahoo, true),
      timeoutMs: input.timeoutMs ? clampNumber(input.timeoutMs, undefined, 1000, 20000) : undefined,
      maxHtmlChars: input.maxHtmlChars ? clampNumber(input.maxHtmlChars, undefined, 10000, 4500000) : undefined,
      valoraeScrapeUrl: resolveSelfScrapeUrl(req, input),
      cache: !(boolParam(input.nocache || input.refresh) || falseParam(input.cache)),
      bypassCache: boolParam(input.nocache || input.refresh),
      debug: boolParam(input.debug),
      view,
      includeQuality: input.includeQuality === undefined ? true : boolParam(input.includeQuality, true),
      profile: input.profile || input.performance,
    }, { endpoint: 'asset', ticker, type });

    const payload = await ValoraeEngine.fetchAtivo(ticker, type, perfOptions);
    return sendJson(req, res, payload, {
      status: 200,
      engineVersion: ValoraeEngine.version,
      profile: payload?.performance?.profile || perfOptions.performanceProfile,
      cachePolicy: perfOptions.cachePolicy,
      cacheControl: perfOptions.performanceProfile === 'fast' || view === 'compact'
        ? 'private, max-age=15, stale-while-revalidate=60'
        : 'no-store, no-cache, max-age=0, must-revalidate',
    });
  } catch (err) {
    return sendRouteError(req, res, err, { version: ValoraeEngine.version, requestId: route.requestId, profile: 'asset' });
  }
}
