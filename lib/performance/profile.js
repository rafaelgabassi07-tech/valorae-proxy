// Performance profiles for Valorae Engine.
// The goal is to let the API trade richness vs latency explicitly.

export const VALORAE_PERFORMANCE_VERSION = '21.5.13-mature-final-release-free';

export const PROFILE_ALIASES = Object.freeze({
  instant: 'instant',
  ultra: 'instant',
  tiny: 'instant',
  ultrafast: 'instant',
  quote: 'fast',
  card: 'fast',
  fast: 'fast',
  wallet: 'portfolio',
  carteira: 'portfolio',
  portfolio: 'portfolio',
  balanced: 'standard',
  standard: 'standard',
  detail: 'deep',
  detailed: 'deep',
  analysis: 'deep',
  complete: 'deep',
  deep: 'deep',
});

const PROFILES = {
  instant: {
    timeoutMs: 3000,
    valoraeScrapeTimeoutMs: 3000,
    maxHtmlChars: 250_000,
    resultCacheTtlMs: 30 * 60 * 1000,
    staleResultCacheMs: 6 * 60 * 60 * 1000,
    includeNewsDefault: false,
    enableInternalApis: false,
    useYahooFallback: true,
    returnHtml: false,
    maxConcurrency: 8,
    description: 'Ultra-fast para apps e dashboards: prioriza cache/Yahoo/seletores leves e evita parsing pesado.'
  },
  fast: {
    timeoutMs: 6500,
    valoraeScrapeTimeoutMs: 6500,
    maxHtmlChars: 900_000,
    resultCacheTtlMs: 15 * 60 * 1000,
    staleResultCacheMs: 60 * 60 * 1000,
    includeNewsDefault: false,
    enableInternalApis: false,
    useYahooFallback: true,
    returnHtml: false,
    maxConcurrency: 6,
    description: 'Baixa latência: usa seletores/cotação, evita HTML pesado, APIs internas e notícias por padrão.'
  },
  standard: {
    timeoutMs: 12_000,
    valoraeScrapeTimeoutMs: 12_000,
    maxHtmlChars: 2_400_000,
    resultCacheTtlMs: 7 * 60 * 1000,
    staleResultCacheMs: 45 * 60 * 1000,
    includeNewsDefault: false,
    enableInternalApis: true,
    useYahooFallback: true,
    returnHtml: true,
    maxConcurrency: 4,
    description: 'Equilíbrio entre riqueza de dados e tempo de resposta.'
  },
  deep: {
    timeoutMs: 18_000,
    valoraeScrapeTimeoutMs: 18_000,
    maxHtmlChars: 4_000_000,
    resultCacheTtlMs: 3 * 60 * 1000,
    staleResultCacheMs: 30 * 60 * 1000,
    includeNewsDefault: false,
    enableInternalApis: true,
    useYahooFallback: true,
    returnHtml: true,
    maxConcurrency: 2,
    description: 'Máxima completude: HTML completo, APIs internas e parsing mais amplo.'
  },
  portfolio: {
    timeoutMs: 7500,
    valoraeScrapeTimeoutMs: 7500,
    maxHtmlChars: 900_000,
    resultCacheTtlMs: 12 * 60 * 1000,
    staleResultCacheMs: 60 * 60 * 1000,
    includeNewsDefault: false,
    enableInternalApis: false,
    useYahooFallback: true,
    returnHtml: false,
    maxConcurrency: 6,
    description: 'Otimizado para carteira e listas: muitos ativos, payload compacto e menor custo.'
  }
};

function boolish(v, fallback = false) {
  if (v === undefined || v === null || v === '') return fallback;
  return ['1', 'true', 'yes', 'sim', 'on'].includes(String(v).toLowerCase());
}

function intish(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function resolvePerformanceProfile(rawProfile = '') {
  const requested = String(rawProfile || '').toLowerCase().trim();
  if (!requested) return { requested: '', profile: '', aliased: false, supported: false };
  const profile = PROFILE_ALIASES[requested] || '';
  return { requested, profile, aliased: Boolean(profile && requested !== profile), supported: Boolean(profile) };
}

function chooseProfile(raw = {}, context = {}) {
  const explicit = String(raw.profile || raw.performance || '').toLowerCase().trim();
  const resolvedExplicit = resolvePerformanceProfile(explicit);
  if (resolvedExplicit.profile) return resolvedExplicit.profile;
  const view = String(raw.view || raw.assetView || '').toLowerCase();
  const endpoint = String(context.endpoint || '').toLowerCase();
  if (endpoint.includes('portfolio') || endpoint === 'assets' || endpoint === 'batch') return 'portfolio';
  if (['instant','ultra','tiny'].includes(view)) return 'instant';
  if (['quote','card','compact'].includes(view)) return 'fast';
  if (['wallet','portfolio','standard'].includes(view)) return 'portfolio';
  if (['detail','analysis','full'].includes(view) && boolish(raw.debug, false)) return 'deep';
  return 'standard';
}

export function resolvePerformanceOptions(raw = {}, context = {}) {
  const requestedProfile = String(raw.profile || raw.performance || '').toLowerCase().trim();
  const alias = resolvePerformanceProfile(requestedProfile);
  const profile = chooseProfile(raw, context);
  const preset = PROFILES[profile] || PROFILES.standard;
  const includeNewsExplicit = raw.includeNews !== undefined || raw.news !== undefined;
  const maxHtmlChars = intish(raw.maxHtmlChars, preset.maxHtmlChars);
  const maxHtmlHardLimit = intish(process.env.VALORAE_MAX_HTML_HARD_LIMIT, 4_500_000);
  return {
    ...raw,
    requestedProfile: requestedProfile || undefined,
    profileAlias: alias.aliased ? { requested: alias.requested, resolved: alias.profile } : undefined,
    profile,
    performanceProfile: profile,
    timeoutMs: intish(raw.timeoutMs, preset.timeoutMs),
    valoraeScrapeTimeoutMs: intish(raw.valoraeScrapeTimeoutMs, preset.valoraeScrapeTimeoutMs),
    maxHtmlChars: Math.min(maxHtmlChars, maxHtmlHardLimit),
    resultCacheTtlMs: intish(raw.resultCacheTtlMs, preset.resultCacheTtlMs),
    staleResultCacheMs: intish(raw.staleResultCacheMs, preset.staleResultCacheMs),
    enableInternalApis: raw.enableInternalApis === undefined ? preset.enableInternalApis : boolish(raw.enableInternalApis, preset.enableInternalApis),
    useYahooFallback: raw.useYahooFallback === undefined ? preset.useYahooFallback : raw.useYahooFallback,
    returnHtml: raw.returnHtml === undefined ? preset.returnHtml : boolish(raw.returnHtml, preset.returnHtml),
    includeNews: includeNewsExplicit ? boolish(raw.includeNews ?? raw.news, false) : preset.includeNewsDefault,
    maxConcurrency: intish(raw.maxConcurrency || raw.concurrency, preset.maxConcurrency),
    cachePolicy: raw.cachePolicy || 'memory-lru-stale-if-error',
    performanceHints: {
      profile,
      requestedProfile: requestedProfile || undefined,
      profileAlias: alias.aliased ? { requested: alias.requested, resolved: alias.profile } : undefined,
      description: preset.description,
      selectorOnly: preset.returnHtml === false,
      internalApis: raw.enableInternalApis === undefined ? preset.enableInternalApis : boolish(raw.enableInternalApis, preset.enableInternalApis),
      cacheTtlMs: intish(raw.resultCacheTtlMs, preset.resultCacheTtlMs),
      staleMs: intish(raw.staleResultCacheMs, preset.staleResultCacheMs)
    }
  };
}

export function performanceCapabilities() {
  return {
    version: VALORAE_PERFORMANCE_VERSION,
    profiles: PROFILES,
    profileAliases: PROFILE_ALIASES,
    queryParams: ['profile=instant|ultra|tiny|quote|card|wallet|analysis|fast|standard|deep|portfolio', 'view=instant|ultra|tiny|quote|card|wallet|detail|analysis|compact|standard|full', 'nocache=1', 'debug=1']
  };
}
