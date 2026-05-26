import { ValoraeEngine, canonicalizeTicker, validarTicker } from '../lib/Valorae-engine.js';
import { resolvePerformanceOptions } from '../lib/performance/profile.js';
import { sendJson } from '../lib/performance/http.js';
import { beginRoute, boolParam, falseParam, parseList, clampNumber, resolveSelfScrapeUrl, sendRouteError } from '../lib/http/route.js';

const MAX_TICKERS = Number(process.env.MAX_TICKERS_PER_REQUEST || 20);

export default async function handler(req, res) {
  const route = beginRoute(req, res, {
    version: ValoraeEngine.version,
    methods: ['GET', 'POST'],
    route: 'assets',
    rateMax: Number(process.env.VALORAE_RATE_LIMIT_ASSETS_MAX || 80),
    profile: 'assets',
  });
  if (route.done) return;
  const input = route.input;

  try {
    const raw = parseList(input.tickers || input.ticker).map(t => String(t).trim()).filter(Boolean);
    if (!raw.length) {
      return sendJson(req, res, {
        version: ValoraeEngine.version,
        requestId: route.requestId,
        error: 'Envie ao menos um ticker.',
        hint: 'GET /api/assets?tickers=PETR4,GARE11 ou POST { "tickers": ["PETR4", "GARE11"] }',
      }, { status: 400, engineVersion: ValoraeEngine.version, profile: 'assets' });
    }
    if (raw.length > MAX_TICKERS) {
      return sendJson(req, res, { version: ValoraeEngine.version, requestId: route.requestId, error: `Máximo de ${MAX_TICKERS} tickers por requisição.` }, { status: 400, engineVersion: ValoraeEngine.version, profile: 'assets' });
    }

    const valid = [];
    const errors = [];
    const seen = new Set();
    for (const r of raw) {
      const t = canonicalizeTicker(r);
      const err = validarTicker(t);
      if (err) errors.push({ ticker: r, error: err });
      else if (!seen.has(t)) { seen.add(t); valid.push(t); }
    }
    if (!valid.length) {
      return sendJson(req, res, { version: ValoraeEngine.version, requestId: route.requestId, error: 'Nenhum ticker válido enviado.', errors }, { status: 400, engineVersion: ValoraeEngine.version, profile: 'assets' });
    }

    const perfOptions = resolvePerformanceOptions({
      mode: input.mode || 'super',
      includeNews: boolParam(input.includeNews ?? input.news, false),
      newsLimit: clampNumber(input.newsLimit || input.limit, 8, 0, 25),
      useYahooFallback: input.yahoo === undefined ? true : boolParam(input.yahoo, true),
      maxConcurrency: clampNumber(input.maxConcurrency || input.concurrency, undefined, 1, 8),
      continueOnError: input.continueOnError === undefined ? true : boolParam(input.continueOnError, true),
      timeoutMs: input.timeoutMs ? clampNumber(input.timeoutMs, undefined, 1000, 20000) : undefined,
      maxHtmlChars: input.maxHtmlChars ? clampNumber(input.maxHtmlChars, undefined, 10000, 4500000) : undefined,
      valoraeScrapeUrl: resolveSelfScrapeUrl(req, input),
      cache: !(boolParam(input.nocache || input.refresh) || falseParam(input.cache)),
      bypassCache: boolParam(input.nocache || input.refresh),
      view: input.view || 'compact',
      includeQuality: input.includeQuality === undefined ? true : boolParam(input.includeQuality, true),
      profile: input.profile || input.performance,
    }, { endpoint: 'assets', batchSize: valid.length });

    const batch = await ValoraeEngine.fetchAtivosBatch(valid, perfOptions);
    return sendJson(req, res, {
      version: ValoraeEngine.version,
      requestId: route.requestId,
      count: batch.assets.length,
      stats: batch.stats,
      assets: batch.assets,
      errors: [...errors, ...batch.errors],
    }, { status: 200, engineVersion: ValoraeEngine.version, profile: perfOptions.performanceProfile, cachePolicy: perfOptions.cachePolicy, cacheControl: 'private, max-age=15, stale-while-revalidate=60' });
  } catch (err) {
    return sendRouteError(req, res, err, { version: ValoraeEngine.version, requestId: route.requestId, profile: 'assets' });
  }
}
