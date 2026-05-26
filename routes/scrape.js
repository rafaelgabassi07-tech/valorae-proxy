import { ValoraeEngine } from '../lib/Valorae-engine.js';
import { sendJson } from '../lib/performance/http.js';
import { beginRoute, boolParam, clampNumber, sendRouteError } from '../lib/http/route.js';
import { extractCustomSelectors, parseSelectorsInput } from '../lib/scrape/custom-selectors.js';

export default async function handler(req, res) {
  const route = beginRoute(req, res, {
    version: ValoraeEngine.version,
    methods: ['GET', 'POST'],
    route: 'scrape',
    rateMax: Number(process.env.VALORAE_RATE_LIMIT_SCRAPE_MAX || 60),
    profile: 'scrape',
  });
  if (route.done) return;
  const input = route.input;

  try {
    const url = input.url;
    if (!url || typeof url !== 'string') {
      return sendJson(req, res, {
        version: ValoraeEngine.version,
        requestId: route.requestId,
        error: 'Envie uma URL HTTPS permitida.',
        example: '/api/scrape?url=https://investidor10.com.br/acoes/petr4/&includeHtml=0',
      }, { status: 400, engineVersion: ValoraeEngine.version, profile: 'scrape' });
    }

    const result = await ValoraeEngine.scrapeUrl(url, {
      provider: input.provider || 'direct',
      timeoutMs: clampNumber(input.timeoutMs || process.env.VALORAE_FETCH_TIMEOUT_MS, 12000, 1000, 20000),
      maxChars: clampNumber(input.maxHtmlChars || process.env.VALORAE_MAX_HTML_CHARS, 3200000, 10000, 4500000),
      cache: input.cache === undefined ? true : boolParam(input.cache, true),
    });
    const includeHtml = boolParam(input.includeHtml || input.html || input.returnHtml, false);
    const customSelectors = parseSelectorsInput(input.selectors);
    const custom = customSelectors ? extractCustomSelectors(result.html || '', customSelectors, {
      maxSelectors: clampNumber(input.maxSelectors, 40, 1, 80),
      maxPerSelector: clampNumber(input.maxPerSelector, 200, 1, 500),
      provider: input.provider || 'direct',
      url: result.url || url,
      minCoverage: input.minSelectorCoverage || input.minCoverage || 0.55,
    }) : null;
    const mergedResults = custom ? { ...(result.selectorResults || {}), ...custom.results } : (result.selectorResults || {});
    const selectorKeys = Object.keys(mergedResults).filter(k => Array.isArray(mergedResults[k]) ? mergedResults[k].length > 0 : mergedResults[k]);
    return sendJson(req, res, {
      version: ValoraeEngine.version,
      requestId: route.requestId,
      ok: result.ok,
      status: result.status,
      blocked: result.blocked,
      error: result.error,
      url: result.url,
      finalUrl: result.finalUrl,
      hostname: result.hostname,
      contentType: result.contentType,
      htmlLength: result.htmlLength,
      provider: result.provider,
      selectorResultKeys: selectorKeys,
      results: mergedResults,
      customSelectorWarnings: custom?.warnings?.length ? custom.warnings : undefined,
      sourceDrift: custom?.sourceDrift,
      elapsedMs: result.elapsedMs,
      cache: result.cache,
      htmlPreview: result.html ? result.html.slice(0, 800) : '',
      html: includeHtml ? result.html : undefined,
    }, { status: 200, engineVersion: ValoraeEngine.version, profile: 'scrape', cacheControl: 'private, max-age=10, stale-while-revalidate=60' });
  } catch (err) {
    return sendRouteError(req, res, err, { version: ValoraeEngine.version, requestId: route.requestId, profile: 'scrape' });
  }
}
