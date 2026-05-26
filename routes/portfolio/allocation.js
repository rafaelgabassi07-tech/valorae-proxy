import { analyzePortfolio, parseBoolean } from '../../lib/portfolio/analytics.js';
import { ValoraeEngine } from '../../lib/Valorae-engine.js';
import { sendJson } from '../../lib/performance/http.js';
import { beginRoute, clampNumber, resolveSelfScrapeUrl, sendRouteError } from '../../lib/http/route.js';

export default async function handler(req, res) {
  const route = beginRoute(req, res, { version: ValoraeEngine.version, methods: ['GET', 'POST'], route: 'portfolio-allocation', rateMax: Number(process.env.VALORAE_RATE_LIMIT_PORTFOLIO_MAX || 60), profile: 'portfolio' });
  if (route.done) return;
  try {
    const input = route.input;
    const data = await analyzePortfolio(input, {
      view: 'full',
      assetView: input.assetView || 'compact',
      cache: !parseBoolean(input.nocache || input.refresh, false),
      bypassCache: parseBoolean(input.nocache || input.refresh, false),
      maxConcurrency: clampNumber(input.maxConcurrency || input.concurrency, 4, 1, 6),
      valoraeScrapeUrl: resolveSelfScrapeUrl(req, input),
      profile: input.profile || input.performance || 'portfolio',
    });
    return sendJson(req, res, { requestId: route.requestId, ...{version:data.version,engineVersion:data.engineVersion,status:data.status,generatedAt:data.generatedAt,summary:data.summary,allocation:data.allocation,insights:data.insights?.filter(i=>/DIVERSIFICATION|CONCENTRATION/.test(i.code))||[],diagnostics:data.diagnostics} }, { status: data.status === 'EMPTY' ? 400 : 200, engineVersion: ValoraeEngine.version, profile: 'portfolio', cacheControl: 'private, max-age=10, stale-while-revalidate=60' });
  } catch (err) {
    return sendRouteError(req, res, err, { version: ValoraeEngine.version, requestId: route.requestId, profile: 'portfolio' });
  }
}
