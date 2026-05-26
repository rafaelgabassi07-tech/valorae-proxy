import { ValoraeEngine } from '../lib/Valorae-engine.js';
import { sendJson } from '../lib/performance/http.js';
import { beginRoute, boolParam, clampNumber, sendRouteError } from '../lib/http/route.js';
import { extractCustomSelectors, parseSelectorsInput } from '../lib/scrape/custom-selectors.js';

const MAX_JOBS = Number(process.env.VALORAE_MAX_BATCH_JOBS || 20);
const MAX_CONCURRENCY = Number(process.env.VALORAE_BATCH_SCRAPE_CONCURRENCY || 4);

function stableStringify(value) {
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function normalizeJobSignature(job = {}, input = {}) {
  return stableStringify({
    url: String(job.url || '').trim(),
    provider: job.provider || input.provider || 'direct',
    selectors: job.selectors || input.selectors || null,
    cache: job.cache !== false,
    includeHtml: boolParam(job.includeHtml ?? job.returnHtml ?? job.html ?? input.includeHtml ?? input.returnHtml ?? input.html, false),
    maxSelectors: job.maxSelectors || input.maxSelectors || null,
    maxPerSelector: job.maxPerSelector || input.maxPerSelector || null,
  });
}

export default async function handler(req, res) {
  const route = beginRoute(req, res, {
    version: ValoraeEngine.version,
    methods: ['POST'],
    route: 'batch-scrape',
    rateMax: Number(process.env.VALORAE_RATE_LIMIT_BATCH_SCRAPE_MAX || 40),
    profile: 'batch-scrape',
  });
  if (route.done) return;
  const input = route.input;

  try {
    const jobs = Array.isArray(input.jobs) ? input.jobs : [];
    if (!jobs.length) {
      return sendJson(req, res, {
        version: ValoraeEngine.version,
        requestId: route.requestId,
        error: 'Envie jobs: [{ "id": "petr4", "url": "https://investidor10.com.br/acoes/petr4/" }]',
      }, { status: 400, engineVersion: ValoraeEngine.version, profile: 'batch-scrape' });
    }
    if (jobs.length > MAX_JOBS) {
      return sendJson(req, res, { version: ValoraeEngine.version, requestId: route.requestId, error: `Máximo de ${MAX_JOBS} jobs por requisição.` }, { status: 400, engineVersion: ValoraeEngine.version, profile: 'batch-scrape' });
    }

    const includeHtml = boolParam(input.includeHtml || input.returnHtml || input.html, false);
    const timeoutMs = clampNumber(input.timeoutMs || process.env.VALORAE_FETCH_TIMEOUT_MS, 12000, 1000, 20000);
    const maxChars = clampNumber(input.maxHtmlChars || process.env.VALORAE_MAX_HTML_CHARS, 3200000, 10000, 4500000);
    const concurrency = Math.max(1, Math.min(clampNumber(input.concurrency, MAX_CONCURRENCY, 1, MAX_CONCURRENCY), MAX_CONCURRENCY, jobs.length));

    // Gap frente ao Scraper (4): batches repetidos podiam reprocessar a mesma URL.
    // A v21.5.13 deduplica assinaturas idênticas dentro da requisição e replica o resultado por índice.
    const groups = new Map();
    jobs.forEach((job, index) => {
      const signature = normalizeJobSignature(job, input);
      if (!groups.has(signature)) groups.set(signature, { job, indexes: [] });
      groups.get(signature).indexes.push(index);
    });
    const uniqueGroups = Array.from(groups.values());
    const groupResults = new Array(uniqueGroups.length);
    let cursor = 0;

    async function buildResult(job, index) {
      const id = job.id || String(index);
      const url = job.url;
      try {
        if (!url || typeof url !== 'string') throw new Error('Job sem URL válida.');
        const result = await ValoraeEngine.scrapeUrl(url, { provider: job.provider || input.provider || 'direct', timeoutMs, maxChars, cache: job.cache !== false });
        const customSelectors = parseSelectorsInput(job.selectors || input.selectors);
        const custom = customSelectors ? extractCustomSelectors(result.html || '', customSelectors, {
          maxSelectors: clampNumber(job.maxSelectors || input.maxSelectors, 40, 1, 100),
          maxPerSelector: clampNumber(job.maxPerSelector || input.maxPerSelector, 200, 1, 1000),
          provider: job.provider || input.provider || 'direct',
          url: result.url || url,
          minCoverage: job.minSelectorCoverage || input.minSelectorCoverage || 0.55,
        }) : null;
        const mergedResults = custom ? { ...(result.selectorResults || {}), ...custom.results } : (result.selectorResults || {});
        const selectorKeys = Object.keys(mergedResults).filter(k => Array.isArray(mergedResults[k]) ? mergedResults[k].length > 0 : mergedResults[k]);
        return {
          id,
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
          html: boolParam(job.includeHtml ?? job.returnHtml ?? job.html, includeHtml) ? result.html : undefined,
        };
      } catch (err) {
        return { id, ok: false, error: err?.message || 'Erro no job.' };
      }
    }

    async function worker() {
      while (cursor < uniqueGroups.length) {
        const groupIndex = cursor++;
        const group = uniqueGroups[groupIndex];
        groupResults[groupIndex] = await buildResult(group.job, group.indexes[0]);
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, uniqueGroups.length) }, () => worker()));

    const results = new Array(jobs.length);
    uniqueGroups.forEach((group, groupIndex) => {
      const base = groupResults[groupIndex];
      group.indexes.forEach((originalIndex, replicaIndex) => {
        results[originalIndex] = { ...base, id: jobs[originalIndex]?.id || String(originalIndex), dedupedFrom: replicaIndex === 0 ? undefined : group.indexes[0] };
      });
    });

    return sendJson(req, res, {
      version: ValoraeEngine.version,
      requestId: route.requestId,
      ok: results.some(r => r?.ok),
      count: results.length,
      uniqueCount: uniqueGroups.length,
      dedupedCount: results.length - uniqueGroups.length,
      concurrency,
      results,
    }, { status: 200, engineVersion: ValoraeEngine.version, profile: 'batch-scrape' });
  } catch (err) {
    return sendRouteError(req, res, err, { version: ValoraeEngine.version, requestId: route.requestId, profile: 'batch-scrape' });
  }
}
