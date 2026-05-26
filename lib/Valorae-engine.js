// Valorae-engine.js
import { enrichAssetResults, buildSchemaValidation, augmentQualityReport, buildSourceReport, buildDebugInfo, VALORAE_SCHEMA_VERSION } from './quality/schema.js';
import { buildFieldConfidence } from './quality/confidence.js';
import { buildValoraeScore } from './quality/valorae-score.js';
import { applyPayloadView } from './quality/views.js';
import { isProviderAvailable, recordProviderResult, getProviderHealthSnapshot } from './resilience/circuit-breaker.js';
import { resolvePerformanceOptions, performanceCapabilities } from './performance/profile.js';
import { marketCacheStats } from './market/cache.js';
import { buildUniversalNormalized, normalizeDividendHistory } from './normalizers/universal.js';
import { buildAssetDataQualityMatrix, buildSourceReliabilityMatrix } from './quality/data-quality.js';
import { applyResilienceWarnings } from './parsers/resilience.js';
import { buildSchemaStability } from './contract/stability.js';

// Motor novo do Valorae Proxy para Vercel/GitHub.
// Foco: dados públicos de ações/FIIs, diagnóstico claro, sem dados sintéticos.

export const VALORAE_ENGINE_VERSION = '21.5.13-mature-final-release-free';

const DEFAULT_TIMEOUT_MS = intEnv('VALORAE_FETCH_TIMEOUT_MS', 12000);
const DEFAULT_MAX_HTML_CHARS = intEnv('VALORAE_MAX_HTML_CHARS', 3_200_000);
const DEFAULT_NEWS_LIMIT = intEnv('VALORAE_NEWS_LIMIT', 8);
const NEWS_CACHE_TTL_MS = intEnv('VALORAE_NEWS_CACHE_TTL_MS', 15 * 60 * 1000);
const HTML_CACHE_TTL_MS = intEnv('VALORAE_HTML_CACHE_TTL_MS', 2 * 60 * 1000);
const ENABLE_INVESTIDOR10_INTERNAL_APIS = boolEnv('VALORAE_ENABLE_INTERNAL_APIS', true);
const USE_YAHOO_FOR_CURRENT_QUOTE = boolEnv('VALORAE_USE_YAHOO_FOR_CURRENT_QUOTE', true);

// Cache final do JSON, inspirado no Scraper (4), mas com chave versionada e bypass por nocache/refresh.
// Mantém velocidade em instâncias quentes sem repetir HTML+APIs internas para o mesmo ticker.
const ASSET_RESULT_CACHE_ENABLED = boolEnv('VALORAE_ASSET_RESULT_CACHE_ENABLED', true);
const ASSET_RESULT_CACHE_TTL_MS = intEnv('VALORAE_ASSET_RESULT_CACHE_TTL_MS', 5 * 60 * 1000);
const ASSET_RESULT_CACHE_MAX_ENTRIES = intEnv('VALORAE_ASSET_RESULT_CACHE_MAX_ENTRIES', 250);
const ASSET_RESULT_CACHE_MAX_BYTES = intEnv('VALORAE_ASSET_RESULT_CACHE_MAX_BYTES', 32 * 1024 * 1024);
const ASSET_RESULT_CACHE_STALE_MS = intEnv('VALORAE_ASSET_RESULT_CACHE_STALE_MS', 45 * 60 * 1000);


// Camada ValoraeScrape self-contained.
// Em produção, /api/asset chama o próprio /api/scrape do mesmo domínio,
// que retorna HTML + seletores. Não depende de serviço externo de scraping.
const ENV_VALORAE_SCRAPE_URL = (process.env.VALORAE_SCRAPE_URL || '').trim();
const VALORAE_SCRAPE_TIMEOUT_MS = intEnv('VALORAE_SCRAPE_TIMEOUT_MS', 12000);
const VALORAE_SCRAPE_RETRIES = intEnv('VALORAE_SCRAPE_RETRIES', 2);
const VALORAE_FAST_DIRECT_FALLBACK = boolEnv('VALORAE_FAST_DIRECT_FALLBACK', false);
const VALORAE_SCRAPE_CACHE_TTL_MS = intEnv('VALORAE_SCRAPE_CACHE_TTL_MS', 5 * 60 * 1000);
const VALORAE_SCRAPE_CLIENT_CACHE_MAX_ENTRIES = intEnv('VALORAE_SCRAPE_CLIENT_CACHE_MAX_ENTRIES', 40);
const VALORAE_SCRAPE_CLIENT_CACHE_MAX_BYTES = intEnv('VALORAE_SCRAPE_CLIENT_CACHE_MAX_BYTES', 16 * 1024 * 1024);

const valoraeScrapeResponseCache = new Map();
const valoraeScrapeInFlight = new Map();
let valoraeScrapeResponseCacheBytes = 0;


const ALLOWED_HOSTS = new Set([
  'investidor10.com.br',
  'www.investidor10.com.br',
  'statusinvest.com.br',
  'www.statusinvest.com.br',
  'query1.finance.yahoo.com',
  'query2.finance.yahoo.com',
  'news.google.com',
]);

const KNOWN_B3_UNITS = new Set([
  // Unidades B3: terminam em 11, mas são ações/units, não FIIs.
  'ALUP11','BPAC11','BRBI11','ENGI11','KLBN11','SANB11','SAPR11','TAEE11','AESB11',
  'RNEW11','APER11','MODL11','SULA11','BIDI11','IGTI11','CPLE11'
]);

const ETF_TICKERS = new Set([
  'BOVA11','IVVB11','SMAL11','DIVO11','FIND11','MATB11','GOVE11','XFIX11','GOLD11','SPXI11',
  'HASH11','BOVB11','BOVS11','BRAX11','XINA11','EURP11','FIXA11','ECOO11','ACWI11','NASD11',
  'USTK11','NSDQ11','DEFI11','ESGE11','SUST11','AGRI11','IFRA11','BDIV11','BNDX11','BOVV11',
  'REIT11','TRET11','WRLD11','XBOV11','PIBB11','SMAC11','MOAT11','PORD11','GLDL11','BITI11',
  'SOLB11','TECC11','BITH11','COIN11','EMAG11','MCHI11','MAGO11','BLOK11','USIG11','SPAB11',
  'CRYP11','ESGB11','SEMI11','RNDP11','FIDC11','ARGT11'
]);

const htmlCache = new Map();
const newsCache = new Map();
const assetResultCache = new Map();
const assetResultInFlight = new Map();
let assetResultCacheBytes = 0;
const assetResultMetrics = { hits: 0, misses: 0, staleHits: 0, sets: 0, evictions: 0, inflightJoins: 0 };


function intEnv(name, fallback) {
  const raw = typeof process !== 'undefined' ? process.env?.[name] : undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function boolEnv(name, fallback = false) {
  const raw = typeof process !== 'undefined' ? process.env?.[name] : undefined;
  if (raw == null || raw === '') return fallback;
  return ['1', 'true', 'yes', 'sim', 'on'].includes(String(raw).toLowerCase());
}

function nowIso() { return new Date().toISOString(); }
function safeText(v) { return typeof v === 'string' ? v : ''; }
function uniq(arr) { return [...new Set(arr.filter(Boolean))]; }

function decodeHtml(input = '') {
  return String(input)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function stripTags(input = '') {
  return decodeHtml(String(input)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>|<\/div>|<\/li>|<\/tr>|<\/h\d>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function compactText(input = '') {
  return stripTags(input).replace(/\s+/g, ' ').trim();
}

function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function canonicalizeTicker(raw = '') {
  return String(raw).replace(/\.SA$/i, '').trim().toUpperCase();
}

export function validarTicker(ticker = '') {
  const t = canonicalizeTicker(ticker);
  if (!t) return 'Ticker vazio';
  if (/^[\^]/.test(t)) return `Índices não são suportados neste endpoint: ${t}`;
  if (!/^(?:[A-Z]{4}\d{1,2}F?|[A-Z]{1,5})$/.test(t)) return `Ticker inválido: ${t}`;
  return null;
}

export function inferAssetType(ticker = '') {
  const t = canonicalizeTicker(ticker);
  if (ETF_TICKERS.has(t)) return 'ETF';
  if (KNOWN_B3_UNITS.has(t)) return 'ACAO';
  if (/3[2-5]$/.test(t)) return 'BDR';
  if (t.endsWith('11')) return 'FII';
  if (/^[A-Z]{1,5}$/.test(t)) return 'STOCK';
  return 'ACAO';
}

function investidor10Urls(ticker, type) {
  const t = canonicalizeTicker(ticker).toLowerCase();
  const urls = [];
  if (type === 'FII') urls.push(`https://investidor10.com.br/fiis/${t}/`);
  else if (type === 'ETF') urls.push(`https://investidor10.com.br/etfs/${t}/`);
  else if (type === 'BDR') urls.push(`https://investidor10.com.br/bdrs/${t}/`);
  else if (type === 'STOCK') urls.push(`https://investidor10.com.br/stocks/${t}/`);
  else urls.push(`https://investidor10.com.br/acoes/${t}/`);

  // Fallbacks defensivos para tickers que possam estar classificados diferente.
  if (type !== 'ACAO') urls.push(`https://investidor10.com.br/acoes/${t}/`);
  if (type !== 'FII' && t.endsWith('11')) urls.push(`https://investidor10.com.br/fiis/${t}/`);
  return uniq(urls);
}

function statusInvestUrls(ticker, type) {
  const t = canonicalizeTicker(ticker).toLowerCase();
  if (type === 'FII') return [`https://statusinvest.com.br/fundos-imobiliarios/${t}`];
  if (type === 'ETF') return [`https://statusinvest.com.br/etfs/${t}`];
  if (type === 'BDR') return [`https://statusinvest.com.br/bdrs/${t}`];
  return [`https://statusinvest.com.br/acoes/${t}`];
}

function browserHeaders(url) {
  const u = new URL(url);
  const ua = process.env.VALORAE_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
  return {
    'User-Agent': ua,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': process.env.VALORAE_ACCEPT_LANGUAGE || 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Referer': `https://${u.hostname}/`,
    'Sec-Ch-Ua': '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
  };
}


const INVESTIDOR10_SELECTORS = {
  cards: { selector: '._card-header, ._card-body' },
  cells_titles: { selector: '.cell span.d-flex, .cell span.title' },
  cells_values: { selector: '.cell .value' },
  table: { selector: 'table tbody tr td' },
  about: { selector: '.description-text, .content--description, .description p, .link-card--description, .text-description p' },
  logo: { selector: '.header-company img, #header-container img, .logo img, .img-logo', extract: 'src' },
  compareUrl: { selector: '#table-compare-tickers, #table-compare-segments, #table-compare-fiis, [data-url*="comparador"]', extract: 'data-url' },
  props: { selector: 'div.card-propertie h3, div.card-property h3' },
  propsSmall: { selector: 'div.card-propertie small, div.card-property small' }
};


function matchBlocksByClass(html, classNeedles, tag = '[a-z0-9]+', limit = 200) {
  const out = [];
  const source = String(html || '');
  const re = new RegExp(`<(${tag})\\b[^>]*class=["'][^"']*(?:${classNeedles.map(escapeRe).join('|')})[^"']*["'][^>]*>[\\s\\S]*?<\\/\\1>`, 'gi');
  let m;
  while ((m = re.exec(source)) && out.length < limit) out.push(m[0]);
  return out;
}

function extractAttr(fragment, attrName) {
  const re = new RegExp(`${escapeRe(attrName)}=["']([^"']+)["']`, 'i');
  return fragment.match(re)?.[1] || '';
}

function extractInvestidor10SelectorResults(html, url = '') {
  const source = String(html || '');
  const results = {
    cards: [],
    cells_titles: [],
    cells_values: [],
    table: [],
    about: [],
    logo: [],
    compareUrl: [],
    props: [],
    propsSmall: [],
  };

  for (const block of matchBlocksByClass(source, ['_card-header', '_card-body'], '[a-z0-9]+', 120)) {
    const txt = compactText(block);
    if (txt) results.cards.push(txt);
  }

  const cellBlocks = matchBlocksByClass(source, ['cell'], 'div', 300);
  for (const cell of cellBlocks) {
    const title =
      compactText(cell.match(/<span\b[^>]*class=["'][^"']*(?:d-flex|title|name)[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || '') ||
      compactText(cell.match(/<span\b[^>]*>([\s\S]*?)<\/span>/i)?.[1] || '');
    const value =
      compactText(cell.match(/<div\b[^>]*class=["'][^"']*(?:value|simple-value)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] || '') ||
      compactText(cell.match(/<strong\b[^>]*>([\s\S]*?)<\/strong>/i)?.[1] || '');
    if (title) results.cells_titles.push(title);
    if (title) results.cells_values.push(value || '');
  }

  const tdRe = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
  let td;
  while ((td = tdRe.exec(source)) && results.table.length < 1200) {
    const txt = compactText(td[1]);
    if (txt) results.table.push(txt);
  }

  const aboutBlocks = [];
  aboutBlocks.push(...matchBlocksByClass(source, ['description-text', 'content--description', 'link-card--description', 'text-description'], '[a-z0-9]+', 20));
  const metaDesc = source.match(/<meta\b[^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']+)["']/i)?.[1];
  for (const block of aboutBlocks) {
    const txt = compactText(block);
    if (txt && txt.length > 30) results.about.push(txt);
  }
  if (metaDesc && !results.about.length) results.about.push(decodeHtml(metaDesc));

  const imgRe = /<img\b[^>]*(?:class=["'][^"']*(?:logo|img-logo)[^"']*["'][^>]*|alt=["'][^"']*(?:logo|PETR|GARE|VISC|empresa|fundo)[^"']*["'][^>]*)>/gi;
  let img;
  while ((img = imgRe.exec(source)) && results.logo.length < 5) {
    const src = extractAttr(img[0], 'src') || extractAttr(img[0], 'data-src');
    if (src) results.logo.push(src.startsWith('/') ? `https://investidor10.com.br${src}` : src);
  }

  const dataUrlRe = /data-url=["']([^"']*(?:comparador|compare)[^"']*)["']/gi;
  let du;
  while ((du = dataUrlRe.exec(source)) && results.compareUrl.length < 20) results.compareUrl.push(decodeHtml(du[1]));

  const propertyBlocks = matchBlocksByClass(source, ['card-propertie', 'card-property'], 'div', 300);
  for (const block of propertyBlocks) {
    const h3 = compactText(block.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || '');
    if (h3) results.props.push(h3);
    const smallRe = /<small\b[^>]*>([\s\S]*?)<\/small>/gi;
    let sm;
    while ((sm = smallRe.exec(block)) && results.propsSmall.length < 600) {
      const txt = compactText(sm[1]);
      if (txt) results.propsSmall.push(txt);
    }
  }

  for (const key of Object.keys(results)) {
    if (!results[key].length) delete results[key];
  }
  return results;
}

function getValoraeScrapeUrl(options = {}) {
  return String(options.valoraeScrapeUrl || options.scrapeUrl || ENV_VALORAE_SCRAPE_URL || '').trim();
}

function isValoraeScrapeEnabled(options = {}) {
  return boolEnv('VALORAE_SCRAPE_ENABLED', true) && !!getValoraeScrapeUrl(options);
}

function cleanHeaderMap(headers) {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) return {};
  const output = {};
  for (const key of Object.keys(headers).sort()) {
    const value = headers[key];
    if (!key || value === undefined || value === null) continue;
    output[key] = String(value);
  }
  return output;
}

function stableStringify(value) {
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function deepClone(value) {
  if (value === undefined || value === null) return value;
  try { return structuredClone(value); } catch (_) {
    try { return JSON.parse(JSON.stringify(value)); } catch (__) { return value; }
  }
}

function assetResultCacheEnabled(options = {}) {
  if (!ASSET_RESULT_CACHE_ENABLED) return false;
  if (options.cache === false || options.bypassCache === true || options.refresh === true || options.nocache === true) return false;
  return true;
}

function assetResultCacheKey(ticker, type, options = {}) {
  return stableStringify({
    v: VALORAE_ENGINE_VERSION,
    ticker: canonicalizeTicker(ticker),
    type: String(type || inferAssetType(ticker)).toUpperCase(),
    mode: options.mode || 'super',
    includeNews: options.includeNews === true || options.includeNews === '1',
    newsLimit: Number(options.newsLimit || DEFAULT_NEWS_LIMIT),
    yahoo: options.useYahooFallback !== false,
    maxHtmlChars: Number(options.maxHtmlChars || DEFAULT_MAX_HTML_CHARS),
    profile: options.performanceProfile || options.profile || 'standard',
    returnHtml: options.returnHtml !== false,
    internalApis: ENABLE_INVESTIDOR10_INTERNAL_APIS && options.enableInternalApis !== false,
    view: options.view || 'full'
  });
}

function assetResultCacheTouch(key, entry) {
  assetResultCache.delete(key);
  assetResultCache.set(key, entry);
}

function assetResultCacheDelete(key) {
  const entry = assetResultCache.get(key);
  if (!entry) return;
  assetResultCacheBytes = Math.max(0, assetResultCacheBytes - entry.bytes);
  assetResultCache.delete(key);
}

function assetResultCacheGet(key, options = {}) {
  const entry = assetResultCache.get(key);
  if (!entry) { assetResultMetrics.misses += 1; return null; }
  const now = Date.now();
  const expired = now > entry.expiresAt;
  const staleAllowed = options.allowStale === true && now <= (entry.staleUntil || entry.expiresAt);
  if (expired && !staleAllowed) {
    assetResultCacheDelete(key);
    assetResultMetrics.misses += 1;
    return null;
  }
  assetResultCacheTouch(key, entry);
  const cloned = deepClone(entry.data);
  if (expired) { cloned.__cacheStale = true; assetResultMetrics.staleHits += 1; }
  else assetResultMetrics.hits += 1;
  return cloned;
}

function assetResultCacheSet(key, data, ttlMs = ASSET_RESULT_CACHE_TTL_MS, staleMs = ASSET_RESULT_CACHE_STALE_MS) {
  if (!data || ttlMs <= 0) return;
  const cloned = deepClone(data);
  const bytes = Buffer.byteLength(JSON.stringify(cloned), 'utf8');
  if (bytes > ASSET_RESULT_CACHE_MAX_BYTES) return;
  assetResultCacheDelete(key);
  while (
    assetResultCache.size >= ASSET_RESULT_CACHE_MAX_ENTRIES ||
    assetResultCacheBytes + bytes > ASSET_RESULT_CACHE_MAX_BYTES
  ) {
    const oldest = assetResultCache.keys().next().value;
    if (!oldest) break;
    assetResultCacheDelete(oldest);
    assetResultMetrics.evictions += 1;
  }
  const expiresAt = Date.now() + ttlMs;
  assetResultCache.set(key, { data: cloned, bytes, expiresAt, staleUntil: expiresAt + Math.max(0, staleMs) });
  assetResultCacheBytes += bytes;
  assetResultMetrics.sets += 1;
}

export function getValoraeRuntimeStats() {
  return {
    version: VALORAE_ENGINE_VERSION,
    caches: {
      assetResult: { enabled: ASSET_RESULT_CACHE_ENABLED, entries: assetResultCache.size, bytes: assetResultCacheBytes, ttlMs: ASSET_RESULT_CACHE_TTL_MS, metrics: { ...assetResultMetrics }, hitRate: assetResultMetrics.hits + assetResultMetrics.misses ? Math.round(assetResultMetrics.hits / (assetResultMetrics.hits + assetResultMetrics.misses) * 10000) / 100 : null },
      html: { entries: htmlCache.size, ttlMs: HTML_CACHE_TTL_MS },
      scrapeResponse: { entries: valoraeScrapeResponseCache.size, bytes: valoraeScrapeResponseCacheBytes, ttlMs: VALORAE_SCRAPE_CACHE_TTL_MS },
      news: { entries: newsCache.size, ttlMs: NEWS_CACHE_TTL_MS },
      market: marketCacheStats()
    },
    providers: getProviderHealthSnapshot(),
    cacheDriver: 'memory',
    performance: performanceCapabilities()
  };
}

function valoraeScrapeTargetHeaders(url) {
  const headers = browserHeaders(url);
  // Mantém o conjunto simples e estável que o proxy funcional usa para melhor cache/coalescing.
  return cleanHeaderMap({
    'User-Agent': process.env.VALORAE_SCRAPE_TARGET_USER_AGENT || process.env.VALORAE_USER_AGENT || headers['User-Agent'],
    'Accept-Language': headers['Accept-Language'],
    'Referer': (() => {
      try {
        const h = new URL(url).hostname.toLowerCase();
        if (h.endsWith('investidor10.com.br')) return 'https://investidor10.com.br/';
        return `https://${h}/`;
      } catch { return 'https://investidor10.com.br/'; }
    })()
  });
}

function buildValoraeScrapePayload(url, options = {}) {
  const parsed = validateUrl(url);
  const host = parsed.hostname.toLowerCase();
  const isInvestidor10 = host.endsWith('investidor10.com.br');
  return {
    url,
    returnHtml: options.returnHtml !== false,
    includeScripts: options.includeScripts ?? true,
    selectors: isInvestidor10 ? INVESTIDOR10_SELECTORS : undefined,
    cacheTtl: Number(options.cacheTtl || (isInvestidor10 ? 4 * 60 * 60 * 1000 : 60 * 1000)),
    headers: cleanHeaderMap({
      ...valoraeScrapeTargetHeaders(url),
      ...cleanHeaderMap(options.headers)
    })
  };
}

function valoraeScrapeCacheKey(payload) {
  return stableStringify(payload);
}

function valoraeScrapeCacheDelete(key) {
  const entry = valoraeScrapeResponseCache.get(key);
  if (!entry) return;
  valoraeScrapeResponseCacheBytes = Math.max(0, valoraeScrapeResponseCacheBytes - entry.bytes);
  valoraeScrapeResponseCache.delete(key);
}

function valoraeScrapeCacheGet(key) {
  const entry = valoraeScrapeResponseCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    valoraeScrapeCacheDelete(key);
    return null;
  }
  valoraeScrapeResponseCache.delete(key);
  valoraeScrapeResponseCache.set(key, entry);
  return { ...entry.data, cache: 'VALORAE_SCRAPE_HIT' };
}

function valoraeScrapeCacheSet(key, data) {
  if (!data) return;
  const bytes = Buffer.byteLength(JSON.stringify({ ...data, html: data.html ? `[${data.html.length} chars]` : '' }), 'utf8') + Buffer.byteLength(data.html || '', 'utf8');
  if (bytes > VALORAE_SCRAPE_CLIENT_CACHE_MAX_BYTES) return;
  valoraeScrapeCacheDelete(key);
  while (valoraeScrapeResponseCache.size >= VALORAE_SCRAPE_CLIENT_CACHE_MAX_ENTRIES || valoraeScrapeResponseCacheBytes + bytes > VALORAE_SCRAPE_CLIENT_CACHE_MAX_BYTES) {
    const oldest = valoraeScrapeResponseCache.keys().next().value;
    if (!oldest) break;
    valoraeScrapeCacheDelete(oldest);
  }
  valoraeScrapeResponseCache.set(key, { data, bytes, expiresAt: Date.now() + VALORAE_SCRAPE_CACHE_TTL_MS });
  valoraeScrapeResponseCacheBytes += bytes;
}

function shouldRetryValoraeScrape(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500 || !status;
}

async function sleep(ms) {
  if (ms > 0) await new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeValoraeScrapeResponse(data, url, started, maxChars) {
  const htmlRaw = data?.html || data?.body || data?.content || data?.text || '';
  const html = typeof htmlRaw === 'string' && htmlRaw.length > maxChars ? htmlRaw.slice(0, maxChars) : String(htmlRaw || '');
  const selectorResults = data?.results && typeof data.results === 'object' ? data.results : {};
  const targetStatus = Number(data?.targetStatus || data?.statusCode || data?.status || (data?.success === false ? 500 : 200));
  const contentType = data?.contentType || data?.headers?.['content-type'] || data?.headers?.['Content-Type'] || (html ? 'text/html' : 'application/json');
  const blocked = [401, 403, 429].includes(targetStatus) || /cloudflare|access denied|forbidden|captcha|waf/i.test(html.slice(0, 4000)) || /403|blocked|forbidden/i.test(String(data?.error || ''));
  const hasSelectorResults = Object.keys(selectorResults).some(k => Array.isArray(selectorResults[k]) ? selectorResults[k].length > 0 : selectorResults[k]);
  const ok = !blocked && (html.length > 200 || hasSelectorResults);
  return {
    ok,
    status: targetStatus,
    url,
    finalUrl: data?.finalUrl || data?.url || url,
    hostname: new URL(url).hostname,
    contentType,
    html: html || '',
    htmlLength: html.length,
    selectorResults,
    selectorResultKeys: Object.keys(selectorResults).filter(k => Array.isArray(selectorResults[k]) ? selectorResults[k].length > 0 : selectorResults[k]),
    blocked,
    elapsedMs: Math.round(performance.now() - started),
    error: blocked ? `ValoraeScrape/WAF HTTP ${targetStatus}` : (!ok ? (data?.error || 'ValoraeScrape sem HTML/seletores úteis') : undefined),
    cache: 'VALORAE_SCRAPE_MISS',
    provider: 'ValoraeScrape'
  };
}

async function fetchViaValoraeScrape(url, options = {}) {
  if (!isValoraeScrapeEnabled(options)) return { ok: false, status: 0, url, finalUrl: url, hostname: new URL(url).hostname, contentType: '', html: '', htmlLength: 0, selectorResults: {}, blocked: false, elapsedMs: 0, error: 'ValoraeScrape desativado', cache: 'VALORAE_SCRAPE_DISABLED', provider: 'ValoraeScrape' };
  const scrapeUrl = getValoraeScrapeUrl(options);
  const timeoutMs = Number(options.valoraeScrapeTimeoutMs || VALORAE_SCRAPE_TIMEOUT_MS);
  const maxChars = Number(options.maxChars || DEFAULT_MAX_HTML_CHARS);
  const payload = buildValoraeScrapePayload(url, options);
  const cacheKey = valoraeScrapeCacheKey(payload);
  const cached = options.cache === false ? null : valoraeScrapeCacheGet(cacheKey);
  if (cached) return cached;
  const inFlight = valoraeScrapeInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const promise = (async () => {
    let lastError = null;
    for (let attempt = 0; attempt <= VALORAE_SCRAPE_RETRIES; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const started = performance.now();
      try {
        const res = await fetch(scrapeUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate, br',
            'X-ValoraeScrape-Client': 'valorae-engine'
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const text = await res.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = null; }
        if (!res.ok) {
          const err = new Error(data?.error || text.slice(0, 180) || `ValoraeScrape HTTP ${res.status}`);
          err.status = res.status;
          throw err;
        }
        if (!data || typeof data !== 'object') throw new Error('ValoraeScrape retornou resposta inválida');
        const normalized = normalizeValoraeScrapeResponse(data, url, started, maxChars);
        if (options.cache !== false && normalized.ok) valoraeScrapeCacheSet(cacheKey, normalized);
        return normalized;
      } catch (err) {
        lastError = err;
        const retryable = err?.name === 'AbortError' || shouldRetryValoraeScrape(err?.status);
        if (attempt >= VALORAE_SCRAPE_RETRIES || !retryable) break;
        await sleep(350 * Math.pow(2, attempt) + Math.floor(Math.random() * 150));
      } finally {
        clearTimeout(timer);
      }
    }
    return {
      ok: false,
      status: lastError?.status || 0,
      url,
      finalUrl: url,
      hostname: new URL(url).hostname,
      contentType: '',
      html: '',
      htmlLength: 0,
      selectorResults: {},
      selectorResultKeys: [],
      blocked: [401, 403, 429].includes(lastError?.status),
      elapsedMs: 0,
      error: lastError?.message || 'ValoraeScrape indisponível',
      cache: 'VALORAE_SCRAPE_ERROR',
      provider: 'ValoraeScrape'
    };
  })();

  valoraeScrapeInFlight.set(cacheKey, promise);
  promise.then(() => valoraeScrapeInFlight.delete(cacheKey), () => valoraeScrapeInFlight.delete(cacheKey));
  return promise;
}

function isPrivateIpLiteral(hostname = '') {
  const h = String(hostname || '').replace(/^\[|\]$/g, '');
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  const m = h.match(/^172\.(\d{1,3})\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  if (['localhost','0.0.0.0','::1'].includes(h.toLowerCase())) return true;
  return false;
}

function validateUrl(url) {
  if (String(url || '').length > intEnv('VALORAE_MAX_TARGET_URL_LENGTH', 2048)) throw new Error('URL de destino muito longa');
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('URL inválida'); }
  if (parsed.protocol !== 'https:') throw new Error('Apenas URLs HTTPS são permitidas');
  if (isPrivateIpLiteral(parsed.hostname)) throw new Error('Host privado/local não permitido');
  if (!ALLOWED_HOSTS.has(parsed.hostname)) throw new Error(`Domínio não permitido: ${parsed.hostname}`);
  return parsed;
}

export async function fetchPublicHtml(url, options = {}) {
  const parsed = validateUrl(url);
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const maxChars = Number(options.maxChars || DEFAULT_MAX_HTML_CHARS);
  const cacheKey = `html:${url}`;
  const useCache = options.cache !== false && (parsed.hostname.includes('investidor10.com.br') || parsed.hostname.includes('statusinvest.com.br'));

  if (useCache) {
    const cached = htmlCache.get(cacheKey);
    if (cached && Date.now() - cached.createdAt < HTML_CACHE_TTL_MS) {
      return { ...cached.value, cache: cached.value.provider === 'ValoraeScrape' ? 'VALORAE_SCRAPE_HTML_HIT' : 'HIT' };
    }
  }

  const providers = [];
  const preferValoraeScrape = options.provider === 'valorae-scrape' || (options.provider !== 'direct' && boolEnv('VALORAE_SCRAPE_FIRST', true));
  if (preferValoraeScrape) providers.push('valorae-scrape', 'direct');
  else providers.push('direct', 'valorae-scrape');
  if (options.provider === 'direct') providers.splice(1);
  if (options.provider === 'valorae-scrape') providers.splice(1);

  const attempts = [];

  for (const provider of providers) {
    if (provider === 'valorae-scrape') {
      const valoraeScrape = await fetchViaValoraeScrape(url, {
        ...options,
        maxChars,
        cache: options.cache,
        returnHtml: options.returnHtml !== false,
        includeScripts: options.includeScripts ?? (options.returnHtml !== false),
      });
      attempts.push({ provider: 'ValoraeScrape', status: valoraeScrape.status, ok: valoraeScrape.ok, blocked: valoraeScrape.blocked, error: valoraeScrape.error, htmlLength: valoraeScrape.htmlLength, selectorResultKeys: valoraeScrape.selectorResultKeys || [] });
      if (valoraeScrape.ok) {
        if (useCache) htmlCache.set(cacheKey, { createdAt: Date.now(), value: valoraeScrape });
        return { ...valoraeScrape, attempts };
      }
      // Se o ValoraeScrape retornou seletores sem HTML, ainda vale devolver para parser selector-based.
      if (Object.keys(valoraeScrape.selectorResults || {}).length > 0) {
        return { ...valoraeScrape, attempts };
      }
      continue;
    }

    if (provider === 'direct' && options.returnHtml === false && VALORAE_FAST_DIRECT_FALLBACK !== true) {
      attempts.push({ provider: 'DirectFetch', status: 0, ok: false, blocked: false, error: 'DirectFetch pulado em perfil selector-only/fast', htmlLength: 0, skipped: true });
      continue;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = performance.now();
    try {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: browserHeaders(url),
      });
      const contentType = res.headers.get('content-type') || '';
      const finalUrl = res.url || url;
      const status = res.status;
      const okContent = /text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType || 'text/html');
      let text = '';
      if (okContent || status < 500) {
        text = await res.text();
        if (text.length > maxChars) text = text.slice(0, maxChars);
      }
      const blocked = [401, 403, 429].includes(status) || /cloudflare|access denied|forbidden|captcha|waf/i.test(text.slice(0, 4000));
      const selectorResults = okContent && text && parsed.hostname.endsWith('investidor10.com.br')
        ? extractInvestidor10SelectorResults(text, finalUrl)
        : {};
      const selectorResultKeys = Object.keys(selectorResults).filter(k => Array.isArray(selectorResults[k]) ? selectorResults[k].length > 0 : selectorResults[k]);
      const value = {
        ok: res.ok && okContent && !blocked && text.length > 200,
        status,
        url,
        finalUrl,
        hostname: parsed.hostname,
        contentType,
        html: okContent ? text : '',
        htmlLength: okContent ? text.length : 0,
        selectorResults,
        selectorResultKeys,
        blocked,
        elapsedMs: Math.round(performance.now() - started),
        error: blocked ? `WAF HTTP ${status}` : (!(res.ok && okContent) ? `HTTP ${status}` : undefined),
        cache: 'MISS',
        provider: 'DirectFetch',
      };
      attempts.push({ provider: 'DirectFetch', status: value.status, ok: value.ok, blocked: value.blocked, error: value.error, htmlLength: value.htmlLength });
      if (value.ok) {
        const withAttempts = { ...value, attempts };
        if (useCache) htmlCache.set(cacheKey, { createdAt: Date.now(), value: withAttempts });
        return withAttempts;
      }
    } catch (err) {
      attempts.push({ provider: 'DirectFetch', status: 0, ok: false, blocked: false, error: err?.name === 'AbortError' ? `Timeout após ${timeoutMs}ms` : (err?.message || 'Erro de rede'), htmlLength: 0 });
    } finally {
      clearTimeout(timer);
    }
  }

  const last = attempts[attempts.length - 1] || {};
  return {
    ok: false,
    status: last.status || 0,
    url,
    finalUrl: url,
    hostname: parsed.hostname,
    contentType: '',
    html: '',
    htmlLength: 0,
    selectorResults: {},
    selectorResultKeys: [],
    blocked: attempts.some(a => a.blocked),
    elapsedMs: 0,
    error: attempts.find(a => a.error)?.error || 'Nenhum provedor retornou HTML útil',
    cache: 'MISS',
    provider: 'None',
    attempts,
  };
}

function normalizeBRNumber(raw) {
  if (raw == null) return undefined;
  let s = String(raw).replace(/R\$|US\$|\s/g, '').trim();
  if (!s || /^[-—–]+$/.test(s)) return undefined;
  const isPercent = s.includes('%');
  s = s.replace('%', '');
  let mult = 1;
  const up = s.toUpperCase();
  if (/TRILH/.test(up)) mult = 1e12;
  else if (/BILH|\bB\b/.test(up)) mult = 1e9;
  else if (/MILH|\bM\b/.test(up)) mult = 1e6;
  else if (/\bK\b/.test(up)) mult = 1e3;
  s = s.replace(/TRILH(?:ÕES|ÃO)?|BILH(?:ÕES|ÃO)?|MILH(?:ÕES|ÃO)?|\b[KBM]\b/gi, '');
  s = s.replace(/\./g, '').replace(',', '.');
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return undefined;
  return isPercent ? `${String(raw).match(/[+-]?[\d.,]+\s*%/)?.[0]?.replace(/\s/g, '') || n + '%'}` : n * mult;
}

function normalizeNumericString(raw) {
  const n = normalizeBRNumber(raw);
  return n !== undefined ? n : undefined;
}

function normalizePercent(raw) {
  if (raw == null) return undefined;
  const m = String(raw).match(/[+-]?[\d,.]+\s*%?/);
  if (!m) return undefined;
  const s = m[0].replace(/\s/g, '');
  return s.includes('%') ? s : `${s}%`;
}

function firstMatch(text, regex, group = 1) {
  const m = text.match(regex);
  return m?.[group]?.trim();
}

function valueAfterLabel(text, labels, kind = 'number', window = 180) {
  const clean = ` ${text.replace(/\s+/g, ' ')} `;
  for (const label of labels) {
    const re = new RegExp(`(?:^|\\s)${escapeRe(label)}(?:\\s|:|-)+(.{0,${window}})`, 'i');
    const m = clean.match(re);
    if (!m) continue;
    const chunk = m[1];
    let raw;
    if (kind === 'percent') raw = firstMatch(chunk, /([+-]?[\d,.]+\s*%)/);
    else if (kind === 'money') raw = firstMatch(chunk, /((?:R\$|US\$)?\s*[+-]?[\d,.]+\s*(?:Bilhões|Bilhão|Milhões|Milhão|Trilhões|Trilhão|[KMB])?)/i);
    else if (kind === 'string') raw = firstMatch(chunk, /([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 .,/%()ºª-]{1,90})/);
    else raw = firstMatch(chunk, /([+-]?[\d,.]+\s*(?:Bilhões|Bilhão|Milhões|Milhão|Trilhões|Trilhão|[KMB])?)/i);
    if (raw && !/^[-—–]+$/.test(raw)) {
      if (kind === 'percent') return normalizePercent(raw);
      if (kind === 'string') return raw.trim();
      return normalizeNumericString(raw);
    }
  }
  return undefined;
}

function getPageTitle(html) {
  return decodeHtml(firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i) || '')
    .replace(/\s*\|\s*Investidor10.*$/i, '')
    .trim();
}

function getH1(html) {
  return stripTags(firstMatch(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) || '').trim();
}

function extractCnpj(text) {
  return firstMatch(text, /(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/);
}

const ACAO_FIELDS = [
  ['precoAtual', ['Cotação','Preço Atual','Valor atual'], 'money'],
  ['variacaoDay', ['Variação','Var. Dia','Variação no dia'], 'percent'],
  ['variacao12m', ['Variação 12M','VARIAÇÃO (12M)','Var 12M'], 'percent'],
  ['dividendYield', ['Dividend Yield','DY atual','DY'], 'percent'],
  ['dyMedio5a', ['DY médio 5 anos','DY Médio 5 anos','DY médio'], 'percent'],
  ['pl', ['P/L','P / L','Preço/Lucro'], 'number'],
  ['pvp', ['P/VP','P / VP','Preço/Valor Patrimonial'], 'number'],
  ['psr', ['P/Receita','PSR'], 'number'],
  ['payout', ['Payout'], 'percent'],
  ['margemLiquida', ['Margem Líquida','Margem Liquida'], 'percent'],
  ['margemBruta', ['Margem Bruta'], 'percent'],
  ['margemEbit', ['Margem EBIT','Margem Ebit','Margem Operacional'], 'percent'],
  ['margemEbitda', ['Margem EBITDA','Margem Ebitda'], 'percent'],
  ['evEbitda', ['EV/EBITDA'], 'number'],
  ['evEbit', ['EV/EBIT'], 'number'],
  ['pEbitda', ['P/EBITDA'], 'number'],
  ['pEbit', ['P/EBIT'], 'number'],
  ['pAtivo', ['P/Ativo'], 'number'],
  ['pCapGiro', ['P/Cap.Giro','P/Capital de Giro','P/Cap Giro'], 'number'],
  ['pAtivoCircLiq', ['P/Ativo Circ. Liq.','P/ACL'], 'number'],
  ['vpa', ['VPA','Valor Patrimonial por Ação'], 'number'],
  ['lpa', ['LPA','Lucro por Ação'], 'number'],
  ['giroAtivos', ['Giro Ativos','Giro de Ativos'], 'number'],
  ['roe', ['ROE'], 'percent'],
  ['roic', ['ROIC'], 'percent'],
  ['roa', ['ROA'], 'percent'],
  ['dividaLiquidaPatrimonio', ['Dívida Líquida / Patrimônio','Dívida Liq/Patrimônio','Div Liq/PL'], 'number'],
  ['dividaLiquidaEbitda', ['Dívida Líquida / Ebitda','Dívida Liq/EBITDA'], 'number'],
  ['liquidezCorrente', ['Liquidez Corrente'], 'number'],
  ['cagrReceitas5a', ['CAGR Receitas 5 anos','CAGR Receitas'], 'percent'],
  ['cagrLucros5a', ['CAGR Lucros 5 anos','CAGR Lucros'], 'percent'],
  ['valorDeMercado', ['Valor de Mercado'], 'money'],
  ['valorDeFirma', ['Valor de Firma','Enterprise Value'], 'money'],
  ['patrimonioLiquido', ['Patrimônio Líquido'], 'money'],
  ['ativosTotais', ['Ativos Totais','Total de Ativos'], 'money'],
  ['faturamento12m', ['Faturamento','Receita Líquida','Receita (12M)'], 'money'],
  ['lucro12m', ['Lucro Líquido','Lucro (12M)'], 'money'],
  ['liquidezMediaDiaria', ['Liquidez Média Diária','Liquidez Diária'], 'money'],
  ['freeFloat', ['Free Float'], 'percent'],
  ['tagAlong', ['Tag Along'], 'percent'],
];

const FII_FIELDS = [
  ['precoAtual', ['Cotação','Preço Atual','Valor atual'], 'money'],
  ['variacaoDay', ['Variação','Var. Dia','Variação no dia'], 'percent'],
  ['variacao12m', ['Variação 12M','VARIAÇÃO (12M)','Var 12M'], 'percent'],
  ['dividendYield', ['Dividend Yield','DY atual','DY'], 'percent'],
  ['pvp', ['P/VP','P / VP'], 'number'],
  ['liquidezDiaria', ['Liquidez Diária','Liquidez'], 'money'],
  ['yield1m', ['Yield 1 mês','Yield 1M','1 mês'], 'percent'],
  ['yield3m', ['Yield 3 meses','Yield 3M','3 meses'], 'percent'],
  ['yield6m', ['Yield 6 meses','Yield 6M','6 meses'], 'percent'],
  ['yield12m', ['Yield 12 meses','Yield 12M','12 meses'], 'percent'],
  ['dyMedio5a', ['DY médio 5 anos','DY Médio 5 anos','DY médio'], 'percent'],
  ['totalDividendos12m', ['Total pago nos últimos 12 meses','Total pago (12M)','Total pago'], 'money'],
  ['ultimoRendimento', ['Último Rendimento','Ultimo Rendimento'], 'money'],
  ['valorPatrimonial', ['Valor Patrimonial por cota','Val. Patrimonial por cota','VP por cota'], 'money'],
  ['valorPatrimonialTotal', ['Valor Patrimonial Total','Val. Patrimonial Total'], 'money'],
  ['patrimonioLiquido', ['Patrimônio Líquido'], 'money'],
  ['numeroCotistas', ['Nº de Cotistas','Número de Cotistas','Cotistas'], 'number'],
  ['cotasEmitidas', ['Cotas Emitidas','Nº de Cotas'], 'number'],
  ['taxaAdministracao', ['Taxa de Administração','Taxa Administração'], 'string'],
  ['tipoFundo', ['Tipo de Fundo','Tipo do Fundo'], 'string'],
  ['segmentoFii', ['Segmento'], 'string'],
  ['mandato', ['Mandato'], 'string'],
  ['publicoAlvo', ['Público Alvo','Publico Alvo'], 'string'],
  ['tipoGestao', ['Tipo de Gestão','Tipo Gestão'], 'string'],
  ['prazoDuracao', ['Prazo de Duração','Prazo Duração'], 'string'],
  ['vacanciaFisica', ['Vacância Física','Vacancia Fisica'], 'percent'],
  ['vacanciaFinanceira', ['Vacância Financeira','Vacancia Financeira'], 'percent'],
  ['pvpMedioTipo', ['P/VP Médio do tipo','P/VP médio'], 'number'],
  ['dyMedioTipo', ['DY Médio do tipo','DY médio do tipo'], 'percent'],
];

function applyFields(text, fields) {
  const out = {};
  for (const [key, labels, kind] of fields) {
    const value = valueAfterLabel(text, labels, kind);
    if (value !== undefined && value !== '') out[key] = value;
  }
  return out;
}

function applyFieldsScoped(text, fields, options = {}) {
  const out = {};
  const stopLabels = options.stopLabels || fields.flatMap(([, labels]) => labels);
  for (const [key, labels, kind] of fields) {
    const value = valueAfterLabelBounded(text, labels, kind, stopLabels);
    if (value !== undefined && value !== '') out[key] = value;
  }
  return out;
}

const FII_STOP_LABELS = [
  'CNPJ', 'MANDATO', 'SEGMENTO', 'TIPO DE FUNDO', 'PRAZO DE DURAÇÃO', 'PRAZO DE DURACAO',
  'TIPO DE GESTÃO', 'TIPO DE GESTAO', 'TAXA DE ADMINISTRAÇÃO', 'TAXA DE ADMINISTRACAO',
  'VACÂNCIA', 'VACANCIA', 'VACÂNCIA FÍSICA', 'VACANCIA FISICA', 'VACÂNCIA FINANCEIRA',
  'VACANCIA FINANCEIRA', 'NÚMERO DE COTISTAS', 'NUMERO DE COTISTAS', 'Nº DE COTISTAS',
  'COTAS EMITIDAS', 'NÚMERO DE COTAS', 'NUMERO DE COTAS', 'PÚBLICO ALVO', 'PUBLICO ALVO',
  'VALOR PATRIMONIAL', 'VAL. PATRIMONIAL', 'VALOR PATRIMONIAL TOTAL', 'PATRIMÔNIO LÍQUIDO',
  'PATRIMONIO LIQUIDO', 'LIQUIDEZ DIÁRIA', 'LIQUIDEZ DIARIA', 'ÚLTIMO RENDIMENTO',
  'ULTIMO RENDIMENTO', 'TOTAL PAGO', 'DIVIDEND YIELD', 'DY', 'P/VP'
];

function trimAtNextLabel(raw = '', stopLabels = [], currentLabels = []) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  const norm = normalizeLoose(text);
  const current = new Set(currentLabels.map(normalizeLoose));
  let cut = text.length;
  for (const label of stopLabels) {
    const nl = normalizeLoose(label);
    if (!nl || current.has(nl)) continue;
    const pos = norm.indexOf(nl, 1);
    if (pos > 0 && pos < cut) cut = pos;
  }
  return text.slice(0, cut).replace(/^[\s:;|–—-]+|[\s:;|–—-]+$/g, '').trim();
}

function valueAfterLabelBounded(text, labels, kind = 'number', stopLabels = [], window = 260) {
  const clean = ` ${String(text || '').replace(/\s+/g, ' ')} `;
  const norm = normalizeLoose(clean);
  for (const label of labels) {
    const nl = normalizeLoose(label);
    const idx = norm.indexOf(nl);
    if (idx === -1) continue;
    const rawAfter = clean.slice(Math.max(0, idx + String(label).length), Math.max(0, idx + String(label).length) + window);
    const chunk = trimAtNextLabel(rawAfter, stopLabels, labels);
    if (!chunk || /^[-—–]+$/.test(chunk)) continue;

    let raw;
    if (kind === 'percent') raw = firstMatch(chunk, /([+-]?\d{1,3}(?:[.,]\d{1,4})?\s*%)/);
    else if (kind === 'money') raw = firstMatch(chunk, /((?:R\$|US\$)?\s*[+-]?\d[\d.]*,?\d*\s*(?:Bilhões|Bilhão|Milhões|Milhão|Trilhões|Trilhão|milhões|milhão|bilhões|bilhão|[KMB])?)/i);
    else if (kind === 'string') raw = chunk;
    else raw = firstMatch(chunk, /([+-]?\d[\d.]*,?\d*\s*(?:Bilhões|Bilhão|Milhões|Milhão|Trilhões|Trilhão|milhões|milhão|bilhões|bilhão|[KMB])?)/i);

    if (raw && !/^[-—–]+$/.test(raw)) {
      if (kind === 'percent') return normalizePercent(raw);
      if (kind === 'string') return cleanFiiTextValue(raw);
      return normalizeNumericString(raw);
    }
  }
  return undefined;
}

function extractFiiInfoSection(text, ticker = '') {
  const t = canonicalizeTicker(ticker);
  const headings = [
    `INFORMAÇÕES SOBRE ${t}`, `Informações sobre ${t}`, 'INFORMAÇÕES SOBRE O FUNDO',
    'INFORMAÇÕES SOBRE', 'DADOS DO FUNDO', 'Dados do Fundo'
  ];
  return sectionSlice(text, headings, [
    'HISTÓRICO DE INDICADORES', 'COMPARAÇÃO DE', 'COMPARANDO COM OUTROS FIIS',
    'Checklist do investidor', 'Distribuições nos últimos', 'DIVIDEND YIELD', 'SOBRE A',
    'Lista de Imóveis', 'COMUNICADOS'
  ], 6500).text;
}

function extractFiiPreciseFields(text, ticker = '') {
  const info = extractFiiInfoSection(text, ticker) || String(text || '').slice(0, 50000);
  const scoped = info.replace(/\s+/g, ' ').trim();
  const out = {};
  const get = (labels, kind, extraStops = []) => valueAfterLabelBounded(scoped, labels, kind, uniq([...FII_STOP_LABELS, ...extraStops]));

  const cnpj = extractCnpj(scoped);
  if (cnpj) out.cnpj = cnpj;

  const mandato = get(['MANDATO'], 'string');
  if (mandato) out.mandato = mandato;
  const segmento = get(['SEGMENTO'], 'string');
  if (segmento) out.segmentoFii = segmento;
  const tipoFundo = get(['TIPO DE FUNDO', 'Tipo do Fundo'], 'string');
  if (tipoFundo) out.tipoFundo = tipoFundo;
  const prazo = get(['PRAZO DE DURAÇÃO', 'PRAZO DE DURACAO'], 'string');
  if (prazo) out.prazoDuracao = prazo;
  const gestao = get(['TIPO DE GESTÃO', 'TIPO DE GESTAO'], 'string');
  if (gestao) out.tipoGestao = gestao;
  const taxa = get(['TAXA DE ADMINISTRAÇÃO', 'TAXA DE ADMINISTRACAO'], 'string');
  if (taxa) out.taxaAdministracao = taxa;
  const publico = get(['PÚBLICO ALVO', 'PUBLICO ALVO'], 'string');
  if (publico) out.publicoAlvo = publico;

  const vacFis = get(['VACÂNCIA FÍSICA', 'VACANCIA FISICA'], 'percent');
  const vacFin = get(['VACÂNCIA FINANCEIRA', 'VACANCIA FINANCEIRA'], 'percent');
  const vac = get(['VACÂNCIA', 'VACANCIA'], 'percent');
  if (vacFis) out.vacanciaFisica = vacFis;
  else if (vac) out.vacanciaFisica = vac;
  if (vacFin) out.vacanciaFinanceira = vacFin;

  const cotistas = get(['NÚMERO DE COTISTAS', 'NUMERO DE COTISTAS', 'Nº DE COTISTAS'], 'number');
  if (cotistas !== undefined) out.numeroCotistas = cotistas;
  const cotas = get(['COTAS EMITIDAS', 'NÚMERO DE COTAS', 'NUMERO DE COTAS'], 'number');
  if (cotas !== undefined) out.cotasEmitidas = cotas;

  const vpCota = get(['VAL. PATRIMONIAL P/ COTA', 'VALOR PATRIMONIAL POR COTA', 'VP POR COTA'], 'money');
  if (vpCota !== undefined) out.valorPatrimonial = vpCota;
  const vpTotal = get(['VALOR PATRIMONIAL TOTAL', 'VAL. PATRIMONIAL TOTAL'], 'money');
  if (vpTotal !== undefined) {
    out.valorPatrimonialTotal = vpTotal;
    out.patrimonioLiquido = vpTotal;
  }

  out._sourceTextLength = scoped.length;
  return out;
}

function parseComparisonValue(raw, kind = 'number') {
  if (!raw) return undefined;
  const clean = String(raw).replace(/\s+/g, ' ').trim();
  if (kind === 'percent') return normalizePercent(clean);
  if (kind === 'money') return normalizeNumericString(clean);
  return normalizeNumericString(clean);
}

function extractMediaTipoSegmentoStructured(text, ticker = '') {
  const tickerUpper = canonicalizeTicker(ticker);
  const sec = sectionSlice(text, ['Média do Tipo e Segmento', 'Média do Tipo', 'Média do Segmento'], ['Comentários', 'Últimas notícias', 'COMUNICADOS', 'SOBRE', 'Lista de Imóveis'], 7000).text;
  if (!sec) return null;
  const compact = sec.replace(/\s+/g, ' ').trim();
  const find = (label, kind) => {
    const idx = normalizeLoose(compact).indexOf(normalizeLoose(label));
    if (idx === -1) return null;
    const chunk = compact.slice(idx + label.length, idx + label.length + 220).replace(new RegExp(`^\\s*${escapeRe(tickerUpper)}\\s*`, 'i'), '');
    const beforeComp = chunk.split(/Comparação|Comparacao/i)[0];
    const afterComp = chunk.split(/Comparação|Comparacao/i)[1] || '';
    let ativoRaw;
    let compRaw;
    if (kind === 'percent') {
      ativoRaw = firstMatch(beforeComp, /([+-]?\d[\d.,]*\s*%)/);
      compRaw = firstMatch(afterComp, /([+-]?\d[\d.,]*\s*%)/);
    } else if (kind === 'money') {
      ativoRaw = firstMatch(beforeComp, /((?:R\$)?\s*\d[\d.,]*\s*(?:Bilhões|Bilhão|Milhões|Milhão|milhões|bilhões)?)/i);
      compRaw = firstMatch(afterComp, /((?:R\$)?\s*\d[\d.,]*\s*(?:Bilhões|Bilhão|Milhões|Milhão|milhões|bilhões)?)/i);
    } else {
      ativoRaw = firstMatch(beforeComp, /(\d[\d.,]*)/);
      compRaw = firstMatch(afterComp, /(\d[\d.,]*)/);
    }
    const ativo = parseComparisonValue(ativoRaw, kind);
    const comparacao = parseComparisonValue(compRaw, kind);
    return ativo !== undefined || comparacao !== undefined ? { ativo, comparacao, ativoRaw: ativoRaw || '', comparacaoRaw: compRaw || '' } : null;
  };
  const out = {
    pvp: find('P/VP', 'number'),
    dy12m: find('DY (12M)', 'percent') || find('Dividend Yield', 'percent') || find('DY 12M', 'percent'),
    valorPatrimonial: find('VALOR PATRIMONIAL', 'money'),
    valorPatrimonialPorCota: find('VAL. PATRIMONIAL P/ COTA', 'money') || find('VALOR PATRIMONIAL POR COTA', 'money') || find('VP/COTA', 'money'),
    rawText: compact.slice(0, 2200),
  };
  // Fallback para o layout textual que vem como: "GARE11 P/VP : 0,89 Comparação 0,81".
  const rx = (label, regex, kind) => {
    if (out[label]) return;
    const m = compact.match(regex);
    if (!m) return;
    const ativoRaw = m[1];
    const comparacaoRaw = m[2] || '';
    out[label] = { ativo: parseComparisonValue(ativoRaw, kind), comparacao: parseComparisonValue(comparacaoRaw, kind), ativoRaw, comparacaoRaw };
  };
  rx('pvp', new RegExp(`${escapeRe(tickerUpper)}\s+P\/VP\s*:?\s*(\d[\d.,]*)(?:\s+Compara[cç][aã]o\s*(\d[\d.,]*))?`, 'i'), 'number');
  rx('dy12m', new RegExp(`${escapeRe(tickerUpper)}\s+(?:DY\s*\(12M\)|Dividend Yield)\s*:?\s*([+-]?\d[\d.,]*\s*%)(?:\s+Compara[cç][aã]o\s*([+-]?\d[\d.,]*\s*%))?`, 'i'), 'percent');
  rx('valorPatrimonial', new RegExp(`${escapeRe(tickerUpper)}\s+VALOR PATRIMONIAL\s*:?\s*((?:R\$)?\s*\d[\d.,]*\s*(?:Bilhões|Bilhão|Milhões|Milhão|[KMB])?)(?:\s+Compara[cç][aã]o\s*((?:R\$)?\s*\d[\d.,]*\s*(?:Bilhões|Bilhão|Milhões|Milhão|[KMB])?))?`, 'i'), 'money');
  rx('valorPatrimonialPorCota', new RegExp(`${escapeRe(tickerUpper)}\s+VAL\.?\s*PATRIMONIAL\s*P\/?\s*COTA\s*:?\s*((?:R\$)?\s*\d[\d.,]*)(?:\s+Compara[cç][aã]o\s*((?:R\$)?\s*\d[\d.,]*))?`, 'i'), 'money');
  return Object.values(out).some(v => v && typeof v === 'object' && (v.ativo !== undefined || v.comparacao !== undefined)) ? out : { rawText: compact.slice(0, 2200) };
}

function pruneBadSectionSummaries(sections = {}) {
  for (const key of ['rentabilidade', 'indicadores', 'mediaTipoSegmento']) {
    const item = sections[key];
    if (item && typeof item === 'object' && typeof item.text === 'string' && looksLikeNavigationBlock(item.text)) {
      delete sections[key];
    }
  }
  return sections;
}

function sanitizeFiiBaseFields(baseFields, text, ticker, genericSections) {
  const precise = extractFiiPreciseFields(text, ticker);
  delete precise._sourceTextLength;
  const out = { ...baseFields, ...precise };

  // Remove valores capturados do checklist em vez da seção cadastral.
  if (out.numeroCotistas !== undefined && Number(out.numeroCotistas) <= 1000 && precise.numeroCotistas === undefined) delete out.numeroCotistas;
  if (out.vacanciaFisica === '10%' && precise.vacanciaFisica === undefined) delete out.vacanciaFisica;
  if (out.vacanciaFinanceira === '10%' && precise.vacanciaFinanceira === undefined) delete out.vacanciaFinanceira;

  for (const k of ['taxaAdministracao','tipoFundo','segmentoFii','mandato','tipoGestao','prazoDuracao','publicoAlvo']) {
    if (typeof out[k] === 'string') {
      out[k] = cleanFiiTextValue(trimAtNextLabel(out[k], FII_STOP_LABELS)).slice(0, 160).trim();
      if (!out[k]) delete out[k];
    }
  }

  const media = extractMediaTipoSegmentoStructured(text, ticker);
  if (media) {
    if (media.pvp?.ativo !== undefined) out.pvp = media.pvp.ativo;
    if (media.dy12m?.ativo !== undefined) out.yield12m = media.dy12m.ativo;
    if (media.valorPatrimonial?.ativo !== undefined) {
      out.valorPatrimonialTotal = media.valorPatrimonial.ativo;
      out.patrimonioLiquido = media.valorPatrimonial.ativo;
    }
    if (media.valorPatrimonialPorCota?.ativo !== undefined) out.valorPatrimonial = media.valorPatrimonialPorCota.ativo;
    genericSections.mediaTipoSegmento = media;
  }
  return out;
}

function normalizeLoose(input = '') {
  return String(input)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%$.,/()\s-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeNavigationBlock(snippet = '') {
  const n = normalizeLoose(snippet);
  const hits = [
    'ativos mais buscados', 'acoes mais buscadas', 'fiis mais buscados',
    'rankings de acoes', 'rankings de fiis', 'ferramentas gerenciador',
    'ver todos setores', 'mais buscados petr4', 'mais buscados kncr11',
    'conversor de criptos', 'renda fixa mais buscadas'
  ].filter(x => n.includes(x)).length;
  const manyMenus = (n.match(/mais buscad/g) || []).length >= 3 || (n.match(/ver todos/g) || []).length >= 3;
  return hits >= 2 || manyMenus;
}

function sectionSlice(text, headings, nextHeadings = [], maxLen = 7000) {
  const source = String(text || '');
  const lower = source.toLowerCase();
  const candidates = [];

  for (const h of headings) {
    const needle = h.toLowerCase();
    let from = 0;
    while (needle && from < lower.length) {
      const idx = lower.indexOf(needle, from);
      if (idx === -1) break;
      const snippet = source.slice(idx, idx + Math.min(1600, maxLen));
      let score = idx;
      if (looksLikeNavigationBlock(snippet)) score += 2_000_000;
      // Prefer headings that look like actual content blocks, often followed by useful domain words.
      const useful = normalizeLoose(snippet).match(/dividend|cotista|patrimonial|p\/vp|yield|comunicado|imoveis|balanco|receita|lucro|checklist|vacancia|comparacao/);
      if (useful) score -= 10_000;
      candidates.push({ idx, heading: h, score });
      from = idx + needle.length;
    }
  }

  if (!candidates.length) return { heading: '', text: '' };
  candidates.sort((a, b) => a.score - b.score || a.idx - b.idx);
  const { idx: start, heading: used } = candidates[0];

  let end = Math.min(source.length, start + maxLen);
  const defaultNext = [
    'Histórico de Dividendos', 'RADAR DE DIVIDENDOS', 'COMPARADOR', 'COMPARAÇÃO',
    'SOBRE A EMPRESA', 'SOBRE O FUNDO', 'DADOS SOBRE', 'INFORMAÇÕES SOBRE',
    'Regiões onde', 'Negócios que', 'POSIÇÃO ACIONÁRIA', 'Receitas e Lucros',
    'LUCRO X COTAÇÃO', 'Resultados', 'EVOLUÇÃO DO PATRIMÔNIO', 'BALANÇO PATRIMONIAL',
    'COMUNICADOS', 'Lista de Imóveis', 'Distribuições nos últimos', 'DIVIDEND YIELD',
    'Média do Tipo', 'Média do Segmento', 'Comentários', 'Últimas notícias'
  ];
  const stops = uniq([...(nextHeadings || []), ...defaultNext]).filter(h => normalizeLoose(h) !== normalizeLoose(used));
  for (const h of stops) {
    const needle = h.toLowerCase();
    const found = lower.indexOf(needle, start + used.length + 20);
    if (found !== -1 && found < end) end = found;
  }
  return { heading: used, text: source.slice(start, end).trim() };
}

function extractDividendHistory(text) {
  const out = [];
  const seen = new Set();
  const re = /(Dividendos|JSCP|JCP|Rend\.?\s*Trib\.?|Rendimento)\s+(\d{2}\/\d{2}\/\d{4})\s+(?:(\d{2}\/\d{2}\/\d{4})\s+)?([\d,.]{1,18})/gi;
  let m;
  while ((m = re.exec(text)) && out.length < 240) {
    const item = {
      tipo: m[1].replace(/\s+/g, ' ').trim(),
      dataCom: m[2],
      dataPagamento: m[3] || '',
      valor: Number(String(m[4]).replace(/\./g, '').replace(',', '.')),
    };
    const key = `${item.tipo}|${item.dataCom}|${item.dataPagamento}|${item.valor}`;
    if (Number.isFinite(item.valor) && !seen.has(key)) { seen.add(key); out.push(item); }
  }
  return out;
}

function parseHtmlTables(html, maxTables = 40) {
  const tables = [];
  const tableRe = /<table[\s\S]*?<\/table>/gi;
  let t;
  while ((t = tableRe.exec(html)) && tables.length < maxTables) {
    const tableHtml = t[0];
    const rows = [];
    const rowRe = /<tr[\s\S]*?<\/tr>/gi;
    let r;
    while ((r = rowRe.exec(tableHtml)) && rows.length < 200) {
      const cells = [];
      const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let c;
      while ((c = cellRe.exec(r[0])) && cells.length < 30) {
        cells.push(stripTags(c[1]).replace(/\s+/g, ' ').trim());
      }
      if (cells.length) rows.push(cells);
    }
    if (rows.length) tables.push({ index: tables.length, rows });
  }
  return tables;
}

function extractTablesByKeywords(tables, keywords) {
  const lowKeys = keywords.map(k => k.toLowerCase());
  return tables.filter(table => {
    const text = table.rows.flat().join(' ').toLowerCase();
    return lowKeys.some(k => text.includes(k));
  });
}

function extractChecklist(text) {
  const sec = sectionSlice(text, ['Checklist do investidor buy and hold', 'Checklist Buy and Hold', 'Buy and Hold'],
    ['Histórico de Dividendos', 'Radar de Dividendos', 'Comparador', 'Sobre a empresa', 'COMUNICADOS'], 6000).text;
  if (!sec) return [];
  const lines = sec.split(/\n|(?<=\?)\s+/).map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const line of lines) {
    if (out.length >= 30) break;
    if (/checklist|buy and hold/i.test(line)) continue;
    if (line.length < 10) continue;
    const aprovado = /sim|aprovado|ok|✓|positivo/i.test(line) ? true : (/não|nao|reprovado|negativo|x/i.test(line) ? false : undefined);
    out.push({ criterio: line.slice(0, 260), aprovado });
  }
  return out;
}

function extractComunicados(html, text) {
  const section = sectionSlice(text, ['COMUNICADOS', 'Comunicados'], ['Veja também', 'Mais sobre', 'Indicadores'], 9000).text;
  const candidates = [];
  const linkRe = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = linkRe.exec(html)) && candidates.length < 300) {
    const href = absolutize(m[1], 'https://investidor10.com.br');
    const label = stripTags(m[2]).replace(/\s+/g, ' ').trim();
    const hay = `${href} ${label}`.toLowerCase();
    if (!label || label.length < 4) continue;
    if (/comunic|fato-relevante|informe|relatorio|resultado|provento|dividendo|noticia|news/i.test(hay)) {
      candidates.push({ title: label.slice(0, 220), link: href, date: firstMatch(label, /(\d{2}\/\d{2}\/\d{4})/) });
    }
  }
  const fromText = [];
  const re = /(\d{2}\/\d{2}\/\d{4})\s+([^\n]{8,220})/g;
  let x;
  while (section && (x = re.exec(section)) && fromText.length < 80) {
    fromText.push({ date: x[1], title: x[2].trim() });
  }
  const all = [...candidates, ...fromText];
  const seen = new Set();
  return all.filter(item => {
    const key = `${item.date || ''}|${item.title}|${item.link || ''}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 80);
}

function absolutize(href, base) {
  try { return new URL(href, base).toString(); } catch { return href; }
}

function extractLinks(html, baseUrl) {
  const links = [];
  const re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && links.length < 400) {
    const title = stripTags(m[2]).replace(/\s+/g, ' ').trim();
    if (title) links.push({ title: title.slice(0, 180), href: absolutize(m[1], baseUrl) });
  }
  return links;
}

function extractImoveis(text, tables) {
  const sec = sectionSlice(text, ['Lista de Imóveis', 'Imóveis', 'Lista de Imoveis'], ['COMUNICADOS', 'Média do Tipo', 'Dividend Yield'], 12000).text;
  const imovelTables = extractTablesByKeywords(tables, ['ABL', 'Estado', 'Cidade', 'Área', 'Vacância', 'Imóvel']);
  const fromTables = imovelTables.flatMap(table => table.rows.slice(1).map(row => ({ row }))).slice(0, 150);
  const fromText = [];
  const re = /([A-Z]{2})\s+([^\n]{3,90})\s+(?:ABL\s*)?([\d.,]+\s*m²|[\d.,]+\s?m2)?/gi;
  let m;
  while (sec && (m = re.exec(sec)) && fromText.length < 80) {
    fromText.push({ estado: m[1], nome: m[2].trim(), abl: m[3] || undefined });
  }
  return fromTables.length ? fromTables : fromText;
}

function extractGenericSectionData(text, tables) {
  const headings = {
    rentabilidade: ['Rentabilidade'],
    indicadores: ['INDICADORES', 'Indicadores'],
    historicoIndicadores: ['Histórico de Indicadores', 'HISTÓRICO DE INDICADORES'],
    checklistBah: ['Checklist do investidor buy and hold', 'CHECKLIST DO INVESTIDOR BUY AND HOLD'],
    radarDividendos: ['RADAR DE DIVIDENDOS', 'Radar de Dividendos'],
    comparadorAcoes: ['COMPARADOR DE AÇÕES', 'Comparador de Ações'],
    comparador: ['COMPARADOR', 'Comparador'],
    comparacaoIndices: ['COMPARAÇÃO DE', 'Comparação com Índices', 'COMPARAÇÃO COM ÍNDICES'],
    comparacaoFiis: ['COMPARANDO COM OUTROS FIIS', 'Comparando com outros FIIs', 'Outros FIIs'],
    comparacaoCommodity: ['Petróleo Brent', 'Brent'],
    sobre: ['SOBRE A EMPRESA', 'SOBRE O FUNDO', 'SOBRE A', 'Sobre a empresa', 'Sobre o fundo'],
    dadosEmpresa: ['DADOS SOBRE A EMPRESA', 'Dados sobre a empresa'],
    informacoesEmpresa: ['INFORMAÇÕES SOBRE A EMPRESA', 'Informações sobre a empresa'],
    regioesReceita: ['Regiões onde', 'Regiões onde gera receita'],
    negociosReceita: ['Negócios que geram receita', 'Negocios que geram receita'],
    posicaoAcionaria: ['POSIÇÃO ACIONÁRIA', 'Posição acionária'],
    receitasLucros: ['Receitas e Lucros'],
    lucroCotacao: ['LUCRO X COTAÇÃO', 'Lucro x Cotação'],
    resultados: ['Resultados'],
    evolucaoPatrimonio: ['EVOLUÇÃO DO PATRIMÔNIO', 'Evolução do Patrimônio'],
    balancoPatrimonial: ['BALANÇO PATRIMONIAL', 'Balanço Patrimonial'],
    distribuicoes12m: ['Distribuições nos últimos 12 meses', 'Distribuicoes nos ultimos 12 meses'],
    dividendYieldSecao: ['DIVIDEND YIELD', 'Dividend Yield'],
    valorPatrimonial: ['Informações sobre valor patrimonial', 'Valor Patrimonial'],
    mediaTipoSegmento: ['Média do Tipo e Segmento', 'Média do Tipo', 'Média do Segmento'],
  };
  const sections = {};
  for (const [key, hs] of Object.entries(headings)) {
    const s = sectionSlice(text, hs, [], key === 'sobre' ? 3000 : 9000).text;
    if (s) sections[key] = summarizeSection(s);
  }
  sections.tables = {
    dividendos: extractTablesByKeywords(tables, ['data com', 'pagamento', 'valor', 'dividendos', 'jscp']).slice(0, 4),
    indicadores: extractTablesByKeywords(tables, ['p/l', 'p/vp', 'roe', 'dy', 'ev/ebitda']).slice(0, 6),
    demonstrativos: extractTablesByKeywords(tables, ['receita', 'lucro', 'patrimônio', 'ativo', 'passivo']).slice(0, 8),
  };
  return sections;
}

function summarizeSection(sec) {
  const compact = sec.replace(/\s+/g, ' ').trim();
  const pairs = extractPairsFromText(compact);
  return {
    text: compact.slice(0, 1800),
    keyValues: pairs.slice(0, 80),
    length: compact.length,
  };
}

function extractPairsFromText(text) {
  const out = [];
  const re = /([A-Za-zÀ-ÿ0-9 ./%()ºª-]{2,45})\s+(R\$\s*[\d.,]+(?:\s*(?:Bilhões|Bilhão|Milhões|Milhão|Trilhões|Trilhão))?|[+-]?[\d.,]+\s*%|[+-]?[\d.,]+)/gi;
  let m;
  while ((m = re.exec(text)) && out.length < 120) {
    const label = m[1].trim();
    if (label.length < 2 || /^(R\$|US\$)$/.test(label)) continue;
    out.push({ label, value: m[2].trim() });
  }
  return out;
}

function extractChartCandidates(html) {
  const scripts = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) && scripts.length < 40) {
    const body = m[1];
    if (/series|categories|labels|data:|chart|grafico|Highcharts|ApexCharts|Chart\(/i.test(body)) {
      const candidate = body.replace(/\s+/g, ' ').trim();
      if (candidate.length > 80) {
        scripts.push({
          kind: detectChartKind(candidate),
          size: candidate.length,
          preview: candidate.slice(0, 1200),
          numbersFound: (candidate.match(/[+-]?\d+(?:[.,]\d+)?/g) || []).slice(0, 80),
        });
      }
    }
  }
  return scripts.slice(0, 12);
}

function detectChartKind(text) {
  if (/Highcharts/i.test(text)) return 'highcharts';
  if (/ApexCharts/i.test(text)) return 'apexcharts';
  if (/Chart\(/i.test(text)) return 'chartjs';
  return 'script-data';
}


function isGenericInvestidor10Logo(url = '') {
  const u = String(url || '').trim();
  return !u || /(?:assets\/front\/images\/logo|logo\.webp|favicon|icon)/i.test(u);
}

function isGenericAboutText(text = '') {
  const compact = stripTags(text).replace(/\s+/g, ' ').trim();
  if (!compact) return true;
  if (/^Tudo sobre finanças, investimentos, ações, indicadores fundamentalistas/i.test(compact)) return true;
  if (/Preço Justo|Graham|Bazin|Radar de Dividendos|Calculadora|Comparador de/i.test(compact)) return true;
  if (/Mostra o rendimento|Magic Number|valor patrimonial é um item determinante|Um maior Yield sugere|Fórmula do Magic Number/i.test(compact)) return true;
  if (/Publicado em|ADICIONAR NA CARTEIRA|Saiba mais/i.test(compact) && compact.length < 500) return true;
  if (looksLikeNavigationBlock(compact)) return true;
  return false;
}

function cleanAboutCandidate(text = '') {
  const compact = stripTags(text).replace(/\s+/g, ' ').trim();
  if (compact.length < 80) return '';
  if (isGenericAboutText(compact)) return '';
  return compact.slice(0, 4500);
}

function cleanFiiTextValue(value = '') {
  let s = stripTags(value).replace(/\s+/g, ' ').trim();
  s = s.replace(/^[:;|–—-]+\s*/, '').trim();
  // Algumas páginas inserem um "O" isolado antes do valor por causa de marcação/ícone do card.
  s = s.replace(/^O\s+(?=(?:Fundo|H[ií]brid|Ativ|Passiv|Indeterminad|Determinado|Investidor|Cotista|0|R\$|\d))/i, '');
  s = s.replace(/\s+O\s*$/i, '').trim();
  return s;
}

function extractMetaDescription(html = '') {
  const source = String(html || '');
  const meta = source.match(/<meta\b[^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
               source.match(/<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["'](?:description|og:description)["']/i)?.[1];
  return meta ? decodeHtml(meta).replace(/\s+/g, ' ').trim() : '';
}

function extractJsonLdDescriptions(html = '') {
  const out = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(String(html || ''))) && out.length < 8) {
    try {
      const parsed = JSON.parse(decodeHtml(m[1]).trim());
      const list = Array.isArray(parsed) ? parsed : (parsed?.['@graph'] ? parsed['@graph'] : [parsed]);
      for (const item of list) {
        const d = item?.description || item?.articleBody || item?.about?.description;
        const c = cleanAboutCandidate(d || '');
        if (c) out.push(c);
      }
    } catch { /* ignora jsonld ruim */ }
  }
  return out;
}

function extractAboutCompany(html = '', text = '', ticker = '', type = '') {
  const candidates = [];
  for (const d of extractJsonLdDescriptions(html)) candidates.push(d);
  const meta = extractMetaDescription(html);
  if (meta) candidates.push(meta);

  const section = sectionSlice(text, [
    'SOBRE A EMPRESA', 'Sobre a empresa', `SOBRE A ${ticker}`, 'SOBRE O FUNDO', 'Sobre o fundo', 'SOBRE A'
  ], [
    'DADOS SOBRE A EMPRESA', 'INFORMAÇÕES SOBRE A EMPRESA', 'POSIÇÃO ACIONÁRIA', 'COMUNICADOS', 'Lista de Imóveis', 'Média do Tipo', 'Dividend Yield'
  ], 5000).text;
  if (section) candidates.push(section.replace(/^(SOBRE[^\n]*)/i, '').trim());

  for (const c of candidates) {
    const cleaned = cleanAboutCandidate(c);
    if (cleaned) return cleaned;
  }
  return '';
}

function normalizeJsLikeJson(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  if (s.endsWith(';')) s = s.slice(0, -1).trim();
  s = s
    .replace(/\bundefined\b/g, 'null')
    .replace(/\bNaN\b/g, 'null')
    .replace(/\bInfinity\b/g, 'null')
    .replace(/,\s*([}\]])/g, '$1');
  // Converte chaves JS-like simples para JSON sem executar conteúdo externo.
  s = s.replace(/([{,]\s*)([A-Za-z_$][\w$-]*)(\s*:)/g, '$1"$2"$3');
  // Converte strings com aspas simples em strings JSON simples. Não tenta suportar
  // expressões, funções ou template strings: se não for JSON seguro, retorna null.
  s = s.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, inner) => JSON.stringify(String(inner).replace(/\\'/g, "'")));
  return s;
}

function safeParseJson(raw) {
  if (!raw) return null;
  const candidates = [String(raw).trim(), decodeHtml(String(raw).trim())]
    .flatMap(s => [s, normalizeJsLikeJson(s)]);
  for (const candidate of candidates) {
    if (!candidate) continue;
    try { return JSON.parse(candidate); } catch {}
  }
  return null;
}

function extractJsonAssignment(html = '', patterns = []) {
  const source = String(html || '');
  for (const pattern of patterns) {
    const re = typeof pattern === 'string'
      ? new RegExp(`${escapeRe(pattern)}\\s*=\\s*(\\{[\\s\\S]*?\\}|\\[[\\s\\S]*?\\])\\s*;`, 'i')
      : pattern;
    const m = source.match(re);
    const parsed = safeParseJson(m?.[1]);
    if (parsed) return parsed;
  }
  return null;
}

function extractBacktickJson(html = '', label = '') {
  const source = String(html || '');
  const re = new RegExp(escapeRe(label) + '[\"\']?\\s*:\\s*JSON\\.parse\\(`([^`]+)`\\)', 'gi');
  const out = [];
  let m;
  while ((m = re.exec(source)) && out.length < 20) {
    const parsed = safeParseJson(m[1]);
    if (parsed) out.push(parsed);
  }
  return out;
}

function extractRentabilidadeChart(html = '') {
  const last = extractBacktickJson(html, 'lastProfitability')[0] || null;
  const profitabilities = extractBacktickJson(html, 'profitabilities');
  const legends = extractBacktickJson(html, 'legend');
  if (!last && !profitabilities.length && !legends.length) return null;

  let bestProfitabilities = [];
  for (const item of profitabilities) {
    if (Array.isArray(item) && JSON.stringify(item).length > JSON.stringify(bestProfitabilities).length) bestProfitabilities = item;
  }
  const legend = legends.find(l => Array.isArray(l) && (!bestProfitabilities.length || l.length === bestProfitabilities.length)) || legends[0] || [];
  return { lastProfitability: last, legend, profitabilities: bestProfitabilities };
}

function extractEmbeddedInvestidor10Data(html = '') {
  const advancedMetrics = extractJsonAssignment(html, [/_sectorIndicators\s*=\s*(\{[\s\S]*?\})\s*;/i, /sectorIndicators\s*=\s*(\{[\s\S]*?\})\s*;/i]);
  const revenueGeography = extractJsonAssignment(html, [/companyRevenuesChartPie\s*=\s*(\{[\s\S]*?\})\s*;/i]);
  const revenueSegment = extractJsonAssignment(html, [/companyBussinesRevenuesChartPie\s*=\s*(\{[\s\S]*?\})\s*;/i, /companyBusinessRevenuesChartPie\s*=\s*(\{[\s\S]*?\})\s*;/i]);
  const rentabilidadeChart = extractRentabilidadeChart(html);
  const companyId = html.match(/\/api\/balancos\/receitaliquida\/chart\/(\d+)\//)?.[1] ||
                    html.match(/companyId\s*=\s*['"]?(\d+)['"]?/)?.[1] || '';
  const tickerId = html.match(/tickerId\s*=\s*['"](\d+)['"]/)?.[1] ||
                   html.match(/data-ticker-id=["'](\d+)["']/i)?.[1] || '';
  const fiiId = html.match(/\/api\/fii\/historico-indicadores\/(\d+)\//i)?.[1] ||
                html.match(/\/api\/fii\/comparador\/table\/(\d+)\//i)?.[1] || '';
  return { advancedMetrics, revenueGeography, revenueSegment, rentabilidadeChart, companyId, tickerId, fiiId };
}

async function fetchJsonUrl(url, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': browserHeaders(url)['User-Agent'],
        'Accept': 'application/json, text/plain, */*',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://investidor10.com.br/'
      }
    });
    if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    const text = await res.text();
    const json = safeParseJson(text);
    if (!json) return { ok: false, status: res.status, error: 'JSON inválido' };
    return { ok: true, status: res.status, data: json };
  } catch (err) {
    return { ok: false, status: 0, error: err?.name === 'AbortError' ? `Timeout ${timeoutMs}ms` : (err?.message || 'Falha de rede') };
  } finally {
    clearTimeout(timer);
  }
}

function formatIndicatorHistoryValue(rawValue, rawType) {
  const n = Number(rawValue);
  if (!Number.isFinite(n)) return stripTags(String(rawValue || '-')) || '-';
  const type = String(rawType || '').toLowerCase();
  const dec = (v, d = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const abbr = (v, d = 2, space = true) => {
    const abs = Math.abs(v);
    if (abs >= 1e9) return `${dec(v / 1e9, d)}${space ? ' ' : ''}B`;
    if (abs >= 1e6) return `${dec(v / 1e6, d)}${space ? ' ' : ''}M`;
    if (abs >= 1e3) return `${dec(v / 1e3, d)}${space ? ' ' : ''}K`;
    return dec(v, 0);
  };
  if (type === 'money_abbr') return `R$ ${abbr(n, 2, true)}`;
  if (type === 'number_abbr') return abbr(n, 0, false);
  if (type === 'money') return `R$ ${dec(n, 2)}`;
  if (type === 'percent') return `${dec(n, 2)}%`;
  if (type === 'number') return dec(n, 0);
  return dec(n, 2);
}

function normalizeFiiHistoricalIndicatorsApi(data) {
  if (!data || typeof data !== 'object') return null;
  const entries = Object.entries(data).filter(([, values]) => Array.isArray(values) && values.length > 0);
  if (!entries.length) return null;
  const years = [];
  for (const [, values] of entries) {
    for (const item of values) {
      const y = String(item?.year || '').trim();
      if (y && !years.includes(y)) years.push(y);
    }
  }
  const colunas = years.length ? years : ['Atual'];
  const linhas = entries.map(([indicador, values]) => {
    const byYear = new Map(values.map(item => [String(item?.year || '').trim(), item]));
    const valores = {};
    for (const col of colunas) {
      const item = byYear.get(col);
      valores[col] = item ? formatIndicatorHistoryValue(item.value, item.type) : '-';
    }
    return { indicador, valores };
  });
  return { colunas, linhas };
}

async function fetchInvestidor10ApiExtras(ticker, type, html, options = {}) {
  if (!ENABLE_INVESTIDOR10_INTERNAL_APIS || options.enableInternalApis === false) return { apiExtras: {}, apiWarnings: [] };
  const ids = extractEmbeddedInvestidor10Data(html);
  const apiExtras = { embedded: {}, chartsFinanceiros: {}, apiStatus: [] };
  const apiWarnings = [];
  if (ids.advancedMetrics) apiExtras.embedded.advancedMetrics = ids.advancedMetrics;
  if (ids.revenueGeography) apiExtras.embedded.revenueGeography = ids.revenueGeography;
  if (ids.revenueSegment) apiExtras.embedded.revenueSegment = ids.revenueSegment;
  if (ids.rentabilidadeChart) apiExtras.embedded.rentabilidadeChart = ids.rentabilidadeChart;

  const timeoutMs = Number(options.internalApiTimeoutMs || process.env.VALORAE_INTERNAL_API_TIMEOUT_MS || 7000);
  const base = 'https://investidor10.com.br';
  const tasks = [];
  if (type === 'ACAO' && ids.companyId) {
    tasks.push(['receitasLucros', `${base}/api/balancos/receitaliquida/chart/${ids.companyId}/3650/false/`]);
    tasks.push(['lucroCotacao', `${base}/api/cotacao-lucro/${ticker.toLowerCase()}/adjusted/`]);
    tasks.push(['evolucaoPatrimonio', `${base}/api/balancos/ativospassivos/chart/${ids.companyId}/3650/`]);
    if (ids.tickerId) tasks.push(['payoutHistorico', `${base}/api/acoes/payout-chart/${ids.companyId}/${ids.tickerId}/${ticker.toUpperCase()}/3650`]);
  }
  if (type === 'FII' && ids.fiiId) {
    tasks.push(['historicoIndicadoresFii', `${base}/api/fii/historico-indicadores/${ids.fiiId}/10`]);
  }

  const responses = await Promise.all(tasks.map(async ([key, url]) => [key, url, await fetchJsonUrl(url, timeoutMs)]));
  for (const [key, url, r] of responses) {
    apiExtras.apiStatus.push({ key, url, ok: r.ok, status: r.status, error: r.error });
    if (!r.ok) continue;
    if (key === 'historicoIndicadoresFii') apiExtras.historicoIndicadoresFii = normalizeFiiHistoricalIndicatorsApi(r.data);
    else apiExtras.chartsFinanceiros[key] = r.data;
  }
  if (apiExtras.apiStatus.some(x => !x.ok)) apiWarnings.push('Algumas APIs internas do Investidor10 não responderam; o JSON manteve os dados disponíveis no HTML.');
  return { apiExtras, apiWarnings };
}

function mergeSectionsDeep(a = {}, b = {}) {
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b || {})) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) out[k] = Array.isArray(out[k]) && out[k].length ? out[k] : v;
    else if (typeof v === 'object' && !Array.isArray(v)) out[k] = mergeSectionsDeep(out[k] || {}, v);
    else if (out[k] === undefined || out[k] === null || out[k] === '') out[k] = v;
  }
  return out;
}

function applyApiExtrasToResults(results, apiExtras = {}, type = '') {
  const out = { ...results };
  const sections = { ...(out.sections || {}) };
  if (apiExtras.embedded) {
    if (apiExtras.embedded.rentabilidadeChart) sections.rentabilidadeChart = apiExtras.embedded.rentabilidadeChart;
    if (apiExtras.embedded.advancedMetrics) {
      out.advancedMetrics = apiExtras.embedded.advancedMetrics;
      sections.indicadoresAvancados = apiExtras.embedded.advancedMetrics;
    }
    if (apiExtras.embedded.revenueGeography) {
      out.revenueGeography = apiExtras.embedded.revenueGeography;
      sections.empresa = mergeSectionsDeep(sections.empresa || {}, { regioesReceita: apiExtras.embedded.revenueGeography });
    }
    if (apiExtras.embedded.revenueSegment) {
      out.revenueSegment = apiExtras.embedded.revenueSegment;
      sections.empresa = mergeSectionsDeep(sections.empresa || {}, { negociosReceita: apiExtras.embedded.revenueSegment });
    }
  }
  if (apiExtras.chartsFinanceiros && Object.keys(apiExtras.chartsFinanceiros).length) {
    out.chartsFinanceiros = apiExtras.chartsFinanceiros;
    sections.demonstrativos = mergeSectionsDeep(sections.demonstrativos || {}, apiExtras.chartsFinanceiros);
  }
  if (apiExtras.historicoIndicadoresFii) {
    sections.historicoIndicadores = apiExtras.historicoIndicadoresFii;
    out.historicoIndicadores = apiExtras.historicoIndicadoresFii;
  }
  if (apiExtras.apiStatus) sections.apiStatus = apiExtras.apiStatus;
  out.sections = sections;
  return out;
}

function applyYahooQuoteToResults(results, yahoo) {
  if (!yahoo?.ok || !yahoo.data) return results;
  const out = { ...results };
  if (out.precoAtual !== undefined && out.precoAtual !== yahoo.data.precoAtual) out.precoAtualInvestidor10 = out.precoAtual;
  if (out.variacaoDay !== undefined && out.variacaoDay !== yahoo.data.variacaoDay) out.variacaoDayInvestidor10 = out.variacaoDay;
  if (yahoo.data.precoAtual !== undefined) out.precoAtual = yahoo.data.precoAtual;
  if (yahoo.data.variacaoDay !== undefined) out.variacaoDay = yahoo.data.variacaoDay;
  out.cotacaoFonte = 'YahooChart';
  return out;
}

function processSelectorPairInto(out, titleRaw, valueRaw) {
  const title = stripTags(titleRaw || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const value = stripTags(valueRaw || '').replace(/\s+/g, ' ').trim();
  if (!title || !value || /^[-—–]+$/.test(value)) return;
  const setNum = (key) => { if (out[key] === undefined) out[key] = normalizeBRNumber(value) ?? value; };
  const setPct = (key) => { if (out[key] === undefined) out[key] = normalizePercent(value) ?? value; };
  const setStr = (key) => { if (out[key] === undefined) out[key] = value; };

  if (title.includes('cotacao') || title.includes('preco atual') || title.includes('valor atual')) setNum('precoAtual');
  if (title.includes('variacao') && title.includes('12')) setPct('variacao12m');
  else if (title.includes('variacao') || title.includes('var. dia')) setPct('variacaoDay');
  if (title === 'dy' || title.includes('dividend yield')) setPct('dividendYield');
  if (title.includes('dy medio')) setPct('dyMedio5a');
  if (title === 'p/l' || title.includes('p/l')) setNum('pl');
  if (title.includes('p/vp')) setNum('pvp');
  if (title.includes('roe')) setPct('roe');
  if (title.includes('roic')) setPct('roic');
  if (title.includes('roa')) setPct('roa');
  if (title.includes('lpa')) setNum('lpa');
  if (title.includes('vpa') || title.includes('vp por cota') || title.includes('valor patrimonial por cota')) setNum('valorPatrimonial');
  if (title.includes('valor de mercado')) setNum('valorDeMercado');
  if (title.includes('valor de firma') || title.includes('enterprise value')) setNum('valorDeFirma');
  if (title.includes('patrimonio liquido')) setNum('patrimonioLiquido');
  if (title.includes('liquidez')) setNum(title.includes('corrente') ? 'liquidezCorrente' : 'liquidezDiaria');
  if (title.includes('payout')) setPct('payout');
  if (title.includes('margem liquida')) setPct('margemLiquida');
  if (title.includes('margem bruta')) setPct('margemBruta');
  if (title.includes('margem ebitda')) setPct('margemEbitda');
  if (title.includes('margem ebit') || title.includes('margem operacional')) setPct('margemEbit');
  if (title.includes('ev/ebitda')) setNum('evEbitda');
  if (title.includes('ev/ebit')) setNum('evEbit');
  if (title.includes('cagr') && title.includes('receita')) setPct('cagrReceitas5a');
  if (title.includes('cagr') && title.includes('lucro')) setPct('cagrLucros5a');
  if (title.includes('cnpj')) setStr('cnpj');
  if (title.includes('segmento')) setStr('segmentoFii');
  if (title.includes('tipo de fundo')) setStr('tipoFundo');
  if (title.includes('mandato')) setStr('mandato');
  if (title.includes('publico') && title.includes('alvo')) setStr('publicoAlvo');
  if (title.includes('gestao')) setStr('tipoGestao');
  if (title.includes('taxa') && title.includes('administracao')) setStr('taxaAdministracao');
  if (title.includes('prazo')) setStr('prazoDuracao');
  if (title.includes('vacancia fisica') || title === 'vacancia') setPct('vacanciaFisica');
  if (title.includes('vacancia financeira')) setPct('vacanciaFinanceira');
  if (title.includes('cotistas')) setNum('numeroCotistas');
  if (title.includes('cotas emitidas') || title.includes('nº de cotas') || title.includes('numero de cotas')) setNum('cotasEmitidas');
  if (title.includes('ultimo rendimento')) setNum('ultimoRendimento');
  if (title.includes('total pago')) setNum('totalDividendos12m');
}

function parseSelectorResults(ticker, type, selectorResults = {}) {
  const out = {};
  const cards = selectorResults.cards || [];
  for (let i = 0; i < cards.length; i += 2) processSelectorPairInto(out, cards[i], cards[i + 1]);
  const titles = selectorResults.cells_titles || [];
  const values = selectorResults.cells_values || [];
  for (let i = 0; i < titles.length; i++) processSelectorPairInto(out, titles[i], values[i]);
  const table = selectorResults.table || [];
  for (let i = 0; i < table.length; i += 2) processSelectorPairInto(out, table[i], table[i + 1]);

  const logos = selectorResults.logo || [];
  if (logos[0]) {
    const candidateLogo = String(logos[0]).startsWith('/') ? `https://investidor10.com.br${logos[0]}` : String(logos[0]);
    if (!isGenericInvestidor10Logo(candidateLogo)) out.logoUrl = candidateLogo;
  }
  const about = (selectorResults.about || [])
    .map(x => cleanAboutCandidate(x))
    .filter(Boolean)
    .slice(0, 3);
  if (about.length) out.sobre = about.join('\n\n');

  const propNames = selectorResults.props || [];
  const propSmalls = selectorResults.propsSmall || [];
  const imoveis = [];
  let smallIdx = 0;
  for (const nome of propNames) {
    if (!nome) continue;
    let estado = '', abl = '';
    for (let s = 0; s < 2 && smallIdx < propSmalls.length; s++, smallIdx++) {
      const txt = stripTags(propSmalls[smallIdx]);
      if (/estado:/i.test(txt)) estado = txt.replace(/estado:/i, '').trim();
      if (/área bruta locável:|area bruta locavel:/i.test(txt)) abl = txt.replace(/área bruta locável:|area bruta locavel:/i, '').trim();
    }
    imoveis.push({ nome: stripTags(nome), estado, abl });
  }
  if (imoveis.length) {
    out.sections = { listaImoveis: imoveis };
  }

  const foundKeys = Object.keys(out).filter(k => out[k] !== undefined && out[k] !== null && k !== 'sections');
  return { results: out, foundKeys, selectorOnly: true };
}

function parseInvestidor10Html(ticker, type, html, sourceUrl) {
  const text = stripTags(html);
  const compact = text.replace(/\s+/g, ' ').trim();
  const tables = parseHtmlTables(html);
  let baseFields = type === 'FII' ? applyFields(compact, FII_FIELDS) : applyFields(compact, ACAO_FIELDS);
  const genericSections = pruneBadSectionSummaries(extractGenericSectionData(text, tables));
  if (type === 'FII') baseFields = sanitizeFiiBaseFields(baseFields, text, ticker, genericSections);
  const cnpj = extractCnpj(compact);
  if (cnpj && !baseFields.cnpj) baseFields.cnpj = cnpj;
  const h1 = getH1(html);
  const pageTitle = getPageTitle(html);
  if (h1) baseFields.nome = h1;
  else if (pageTitle) baseFields.nome = pageTitle;

  const aboutCompany = extractAboutCompany(html, text, ticker, type);
  if (aboutCompany) baseFields.sobre = aboutCompany;
  else if (baseFields.sobre && cleanAboutCandidate(baseFields.sobre) === '') delete baseFields.sobre;

  const dividendos = extractDividendHistory(compact);
  if (dividendos.length) baseFields.historicoDividendos = dividendos;

  const sections = {
    ...genericSections,
    checklistBah: extractChecklist(text),
    dividendos: {
      historico: dividendos,
      totalDividendos12m: baseFields.totalDividendos12m,
      dividendYield: baseFields.dividendYield,
      dyMedio5a: baseFields.dyMedio5a,
      radar: genericSections.radarDividendos || null,
    },
    comunicados: extractComunicados(html, text),
    charts: extractChartCandidates(html),
    links: extractLinks(html, sourceUrl).slice(0, 80),
  };
  if (aboutCompany) sections.sobre = { text: aboutCompany, keyValues: extractPairsFromText(aboutCompany).slice(0, 20), length: aboutCompany.length };

  if (type === 'FII') {
    sections.listaImoveis = extractImoveis(text, tables);
    sections.informacoesFundo = pick(baseFields, [
      'cnpj','numeroCotistas','cotasEmitidas','taxaAdministracao','tipoFundo','segmentoFii','mandato','publicoAlvo','tipoGestao','prazoDuracao','vacanciaFisica','vacanciaFinanceira'
    ]);
    sections.distribuicoes12m = pick(baseFields, ['yield1m','yield3m','yield6m','yield12m','totalDividendos12m','ultimoRendimento']);
    if (genericSections.mediaTipoSegmento && Object.keys(genericSections.mediaTipoSegmento).length) sections.mediaTipoSegmento = genericSections.mediaTipoSegmento;
    else { const mediaFallback = pick(baseFields, ['pvpMedioTipo','dyMedioTipo']); if (Object.keys(mediaFallback).length) sections.mediaTipoSegmento = mediaFallback; }
    sections.valorPatrimonial = pick(baseFields, ['valorPatrimonial','valorPatrimonialTotal','patrimonioLiquido','pvp']);
  } else {
    sections.empresa = {
      sobre: genericSections.sobre || null,
      dados: pick(baseFields, ['cnpj','valorDeMercado','valorDeFirma','patrimonioLiquido','ativosTotais','faturamento12m','lucro12m','freeFloat','tagAlong']),
      regioesReceita: genericSections.regioesReceita || null,
      negociosReceita: genericSections.negociosReceita || null,
      posicaoAcionaria: genericSections.posicaoAcionaria || null,
    };
    sections.demonstrativos = {
      receitasLucros: genericSections.receitasLucros || null,
      lucroCotacao: genericSections.lucroCotacao || null,
      resultados: genericSections.resultados || null,
      evolucaoPatrimonio: genericSections.evolucaoPatrimonio || null,
      balancoPatrimonial: genericSections.balancoPatrimonial || null,
    };
  }

  baseFields.sections = sections;
  const foundKeys = Object.keys(baseFields).filter(k => baseFields[k] !== undefined && baseFields[k] !== null && k !== 'sections');
  return {
    results: baseFields,
    foundKeys,
    htmlBytesProcessed: html.length,
    textBytesProcessed: text.length,
    tableCount: tables.length,
    chartCandidateCount: sections.charts.length,
    sourceUrl,
  };
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}


function historicalCurrentValue(results = {}, indicadorRe) {
  const hist = results.sections?.historicoIndicadores || results.historicoIndicadores;
  const linhas = Array.isArray(hist?.linhas) ? hist.linhas : [];
  const row = linhas.find(r => indicadorRe.test(String(r?.indicador || '')));
  if (!row?.valores) return undefined;
  return row.valores.Atual || row.valores.atual || row.valores['Último'] || row.valores['Ultimo'];
}

function cleanFiiInfoObject(info = {}) {
  const out = { ...(info || {}) };
  for (const key of ['taxaAdministracao','tipoFundo','segmentoFii','mandato','tipoGestao','prazoDuracao','publicoAlvo']) {
    if (typeof out[key] === 'string') out[key] = cleanFiiTextValue(out[key]);
  }
  return out;
}

function sanitizeFiiSections(results = {}) {
  const out = { ...results };
  const sections = { ...(out.sections || {}) };

  // Blocos que aparecem em FIIs por navegação global ou por área de ações/commodities.
  for (const key of ['radarDividendos','comparadorAcoes','comparador','comparacaoCommodity','dividendYieldSecao']) delete sections[key];
  if (sections.radarDividendos?.text && looksLikeNavigationBlock(sections.radarDividendos.text)) delete sections.radarDividendos;

  if (sections.informacoesFundo) {
    sections.informacoesFundo = cleanFiiInfoObject(sections.informacoesFundo);
    for (const [k, v] of Object.entries(sections.informacoesFundo)) if (out[k] === undefined || out[k] === null || out[k] === '') out[k] = v;
  }

  if (isGenericInvestidor10Logo(out.logoUrl)) delete out.logoUrl;

  const sectionAbout = typeof sections.sobre === 'string' ? sections.sobre : sections.sobre?.text;
  const cleanSectionAbout = cleanAboutCandidate(sectionAbout || '');
  if (cleanSectionAbout) out.sobre = cleanSectionAbout;
  else if (isGenericAboutText(out.sobre)) delete out.sobre;

  if (out.dividendos && !sections.dividendos) sections.dividendos = out.dividendos;

  const dy12m = sections.distribuicoes12m?.yield12m || out.yield12m || historicalCurrentValue({ ...out, sections }, /^Dividend Yield$/i) || out.dividendYield;
  if (dy12m && sections.dividendos) {
    if (!sections.dividendos.dividendYield || sections.dividendos.dividendYield === '8%' || /^8,?00?%?$/.test(String(sections.dividendos.dividendYield))) {
      sections.dividendos.dividendYield = dy12m;
    }
    out.dividendos = sections.dividendos;
  }
  if ((!out.dividendYield || out.dividendYield === '8%' || /^8,?00?%?$/.test(String(out.dividendYield))) && dy12m) out.dividendYield = dy12m;

  const vpTotalRaw = historicalCurrentValue({ ...out, sections }, /^Valor Patrimonial$/i);
  const vpCotaRaw = historicalCurrentValue({ ...out, sections }, /Val\. Patrimonial p\/ Cota|Valor Patrimonial.*Cota/i);
  const pvpRaw = historicalCurrentValue({ ...out, sections }, /^P\/VP$/i);
  const valorMercadoRaw = historicalCurrentValue({ ...out, sections }, /^Valor de Mercado$/i);
  const liquidezRaw = historicalCurrentValue({ ...out, sections }, /Liquidez Diária|Liquidez Media Diaria|Liquidez Média Diária/i);
  const cotistasRaw = historicalCurrentValue({ ...out, sections }, /Número de Cotistas|Numero de Cotistas/i);
  const cotasRaw = historicalCurrentValue({ ...out, sections }, /Cotas Emitidas/i);

  sections.valorPatrimonial = { ...(sections.valorPatrimonial || {}) };
  if (vpTotalRaw) {
    sections.valorPatrimonial.patrimonioLiquidoRaw = vpTotalRaw;
    const n = normalizeBRNumber(vpTotalRaw);
    if (n !== undefined) {
      sections.valorPatrimonial.patrimonioLiquido = n;
      sections.valorPatrimonial.valorPatrimonialTotal = n;
      out.patrimonioLiquido = n;
      out.valorPatrimonialTotal = n;
    }
  }
  if (vpCotaRaw) {
    sections.valorPatrimonial.valorPatrimonialRaw = vpCotaRaw;
    const n = normalizeBRNumber(vpCotaRaw);
    if (n !== undefined) {
      sections.valorPatrimonial.valorPatrimonial = n;
      out.valorPatrimonial = n;
    }
  }
  if (pvpRaw) {
    const n = normalizeBRNumber(pvpRaw);
    if (n !== undefined) {
      sections.valorPatrimonial.pvp = n;
      out.pvp = n;
    }
  }
  if (valorMercadoRaw) {
    const n = normalizeBRNumber(valorMercadoRaw);
    if (n !== undefined) {
      out.valorDeMercado = n;
      sections.valorPatrimonial.valorDeMercado = n;
      sections.valorPatrimonial.valorDeMercadoRaw = valorMercadoRaw;
    }
  }
  if (liquidezRaw) {
    const n = normalizeBRNumber(liquidezRaw);
    if (n !== undefined) out.liquidezDiaria = n;
  }
  // Mantém o valor exato vindo da seção cadastral; usa histórico só quando não houver número real.
  if (out.numeroCotistas === undefined && cotistasRaw) {
    const n = normalizeBRNumber(cotistasRaw);
    if (n !== undefined) out.numeroCotistas = n;
  }
  if (out.cotasEmitidas === undefined && cotasRaw) {
    const n = normalizeBRNumber(cotasRaw);
    if (n !== undefined) out.cotasEmitidas = n;
  }

  out.sections = sections;
  return out;
}

function sanitizeAcaoResults(results = {}) {
  const out = { ...results };
  const sem = out.indicadoresFundamentalistas?.semComparativos;
  if (sem && typeof sem === 'object') {
    // O parser amplo pode pegar valores de cards vizinhos; o bloco estruturado de indicadores tem prioridade.
    const keys = [
      'pl','pvp','psr','dividendYield','payout','margemLiquida','margemBruta','margemEbit','margemEbitda',
      'evEbitda','evEbit','pEbitda','pEbit','pAtivo','pCapGiro','pAtivoCircLiq','vpa','valorPatrimonial','lpa',
      'giroAtivos','roe','roic','roa','dividaLiquidaPatrimonio','dividaLiquidaEbitda','dividaLiquidaEbit',
      'dividaBrutaPatrimonio','patrimonioAtivos','passivosAtivos','liquidezCorrente','cagrReceitas5a','cagrLucros5a'
    ];
    for (const key of keys) {
      const semKey = key === 'dividendYield' ? 'dy' : key;
      if (sem[semKey] !== undefined) out[key] = sem[semKey];
    }
    if (sem.dy !== undefined) out.dividendYield = sem.dy;
    if (sem.vpa !== undefined) out.valorPatrimonial = sem.vpa;
  }

  if (out.dadosEmpresa?.cnpj && !out.cnpj) out.cnpj = out.dadosEmpresa.cnpj;
  if (out.informacoesEmpresa && typeof out.informacoesEmpresa === 'object') {
    for (const key of ['valorDeMercado','valorDeFirma','patrimonioLiquido','freeFloat','tagAlong','liquidezMediaDiaria']) {
      if (out.informacoesEmpresa[key] !== undefined) out[key] = out.informacoesEmpresa[key];
    }
    if (out.informacoesEmpresa.liquidezMediaDiaria !== undefined) out.liquidezDiaria = out.informacoesEmpresa.liquidezMediaDiaria;
  }

  if (out.dividendos?.historico?.length && !out.historicoDividendos?.length) out.historicoDividendos = out.dividendos.historico;
  if (out.dividendos?.dividendYield) out.dividendYield = out.dividendos.dividendYield;
  if (out.dividendos?.dyMedio5a) out.dyMedio5a = out.dividendos.dyMedio5a;

  const sections = { ...(out.sections || {}) };
  if (out.indicadoresFundamentalistas) sections.indicadores = out.indicadoresFundamentalistas;
  if (out.rentabilidade) sections.rentabilidade = out.rentabilidade;
  if (out.rentabilidadeReal) sections.rentabilidadeReal = out.rentabilidadeReal;
  if (out.checklistBuyAndHold) sections.checklistBah = out.checklistBuyAndHold;
  if (out.dividendos) sections.dividendos = out.dividendos;
  if (out.tabelaComparativoPares) sections.comparador = { pares: out.tabelaComparativoPares };
  if (out.commodities) sections.comparacaoCommodity = out.commodities;
  if (out.noticias) sections.comunicados = out.noticias;
  if (out.dadosEmpresa || out.informacoesEmpresa || out.sobre) {
    sections.empresa = mergeSectionsDeep(sections.empresa || {}, {
      sobre: isGenericAboutText(out.sobre) ? undefined : out.sobre,
      dados: out.dadosEmpresa,
      informacoes: out.informacoesEmpresa,
    });
  }
  if (Object.keys(sections).length) out.sections = sections;

  if (isGenericInvestidor10Logo(out.logoUrl)) delete out.logoUrl;
  // Para ação, a descrição SEO do ticker ainda é melhor do que texto genérico global; remove só os blocos claramente globais/lixo.
  if (isGenericAboutText(out.sobre) && !new RegExp(`\b${escapeRe(String(out.nome || ''))}\b|\b${escapeRe(String(out.dadosEmpresa?.nomeCompleto || ''))}\b`, 'i').test(String(out.sobre || ''))) delete out.sobre;
  return out;
}

function postProcessResultsByType(ticker, type, results = {}) {
  if (type === 'FII') return sanitizeFiiSections(results);
  return sanitizeAcaoResults(results);
}

function mergeParsedResults(primary = {}, secondary = {}) {
  // primary = seletores retornados pelo ValoraeScrape; secondary = parser amplo + parser específico por seção.
  // Na v19.9 o parser específico do HTML tem prioridade para evitar campos de FII poluídos por checklist/menu.
  const merged = { ...primary, ...secondary };
  if (primary.sections || secondary.sections) {
    merged.sections = mergeSectionsDeep(primary.sections || {}, secondary.sections || {});
  }
  return merged;
}

function buildCoverage(type, results = {}) {
  const s = results.sections || {};
  const common = {
    rentabilidade: !!(s.rentabilidade || s.rentabilidadeChart),
    historicoIndicadores: !!(s.historicoIndicadores || results.historicoIndicadores),
    checklistBah: Array.isArray(s.checklistBah) ? s.checklistBah.length > 0 : !!s.checklistBah,
    dividendos: !!(results.historicoDividendos?.length || s.dividendos?.historico?.length),
    comunicados: Array.isArray(s.comunicados) ? s.comunicados.length > 0 : !!s.comunicados,
    graficos: !!(s.rentabilidadeChart || results.chartsFinanceiros || (Array.isArray(s.charts) && s.charts.length > 0)),
  };
  if (type === 'FII') {
    return {
      ...common,
      informacoesFundo: !!s.informacoesFundo && Object.keys(s.informacoesFundo).length > 0,
      comparacaoIndices: !!s.comparacaoIndices,
      comparacaoFiis: !!s.comparacaoFiis,
      distribuicoes12m: !!s.distribuicoes12m && Object.keys(s.distribuicoes12m).length > 0,
      dividendYield: !!(results.dividendYield || s.dividendYieldSecao),
      sobre: !!results.sobre,
      listaImoveis: Array.isArray(s.listaImoveis) ? s.listaImoveis.length > 0 : !!s.listaImoveis,
      valorPatrimonial: !!(s.valorPatrimonial || results.valorPatrimonial || results.valorPatrimonialTotal),
      mediaTipoSegmento: !!s.mediaTipoSegmento,
    };
  }
  return {
    ...common,
    indicadores: ['pl','pvp','dividendYield','roe','roic','payout'].some(k => results[k] !== undefined),
    radarDividendos: !!s.radarDividendos,
    comparadorAcoes: !!(s.comparadorAcoes || s.comparador),
    comparacaoIndices: !!s.comparacaoIndices,
    comparacaoCommodity: !!s.comparacaoCommodity,
    sobreEmpresa: !!(results.sobre || s.empresa?.sobre),
    dadosEmpresa: !!(s.empresa?.dados && Object.keys(s.empresa.dados).length > 0),
    regioesReceita: !!(s.empresa?.regioesReceita || results.revenueGeography),
    negociosReceita: !!(s.empresa?.negociosReceita || results.revenueSegment),
    posicaoAcionaria: !!s.empresa?.posicaoAcionaria,
    receitasLucros: !!(s.demonstrativos?.receitasLucros || results.chartsFinanceiros?.receitasLucros),
    lucroCotacao: !!(s.demonstrativos?.lucroCotacao || results.chartsFinanceiros?.lucroCotacao),
    resultados: !!s.demonstrativos?.resultados,
    evolucaoPatrimonio: !!(s.demonstrativos?.evolucaoPatrimonio || results.chartsFinanceiros?.evolucaoPatrimonio),
    balancoPatrimonial: !!s.demonstrativos?.balancoPatrimonial,
  };
}


function buildQualityReport(type, results = {}, coverage = {}, warnings = []) {
  const checks = [];
  let score = 0;
  let max = 0;
  const add = (name, ok, weight, note = '') => {
    const passed = !!ok;
    checks.push({ name, ok: passed, weight, note });
    max += weight;
    if (passed) score += weight;
  };

  if (type === 'FII') {
    add('identidade', !!(results.nome || results.sobre || results.cnpj), 10, 'Nome, CNPJ ou descrição do fundo.');
    add('informacoesFundo', !!(coverage.informacoesFundo || results.informacoesFundo || results.numeroCotistas), 14, 'Dados cadastrais do FII.');
    add('indicadoresFii', !!(results.pvp || results.dividendYield || results.yield12m || results.valorPatrimonial), 14, 'P/VP, DY, VP/cota e yields.');
    add('historicoIndicadores', !!coverage.historicoIndicadores, 14, 'Histórico anual de indicadores.');
    add('dividendos', !!coverage.dividendos, 14, 'Histórico de distribuições.');
    add('rentabilidade', !!coverage.rentabilidade, 10, 'Rentabilidade nominal/real e/ou gráfico.');
    add('portfolioImoveis', !!coverage.listaImoveis, 10, 'Lista de imóveis/portfólio.');
    add('comparativos', !!(coverage.comparacaoIndices || coverage.mediaTipoSegmento || results.rentabilidadeVsIndicadores), 8, 'Comparativos com índices, tipo ou segmento.');
    add('comunicadosNoticias', !!coverage.comunicados, 6, 'Comunicados ou notícias relacionadas.');
  } else {
    add('cotacao', !!(results.precoAtual || results.variacaoDay || results.variacao12m), 10, 'Cotação atual e variações.');
    add('indicadores', !!coverage.indicadores, 16, 'Indicadores fundamentalistas.');
    add('comparativoSetor', !!(results.comparativoSetor || results.indicadoresFundamentalistas?.comparativoSetor), 12, 'Comparação setor/subsetor/segmento.');
    add('empresa', !!(coverage.dadosEmpresa || results.dadosEmpresa || results.informacoesEmpresa), 12, 'Dados cadastrais e informações corporativas.');
    add('dividendos', !!coverage.dividendos, 12, 'Dividendos e DY.');
    add('rentabilidade', !!coverage.rentabilidade, 10, 'Rentabilidade nominal/real.');
    add('checklist', !!coverage.checklistBah, 8, 'Checklist buy and hold.');
    add('comparadorPares', !!coverage.comparadorAcoes, 8, 'Tabela de pares/concorrentes.');
    add('graficosFinanceiros', !!(coverage.receitasLucros || coverage.lucroCotacao || coverage.evolucaoPatrimonio || coverage.graficos), 8, 'Gráficos e APIs internas.');
    add('comunicadosNoticias', !!coverage.comunicados, 4, 'Comunicados ou notícias relacionadas.');
  }

  const penalties = [];
  if (isGenericInvestidor10Logo(results.logoUrl)) penalties.push({ code: 'GENERIC_LOGO', points: 4, message: 'logoUrl genérico do Investidor10 detectado.' });
  if (isGenericAboutText(results.sobre)) penalties.push({ code: 'GENERIC_ABOUT', points: 6, message: 'Descrição genérica detectada.' });
  if (warnings?.length) penalties.push({ code: 'WARNINGS', points: Math.min(8, warnings.length * 2), message: `${warnings.length} aviso(s) no processamento.` });

  const penaltyPoints = penalties.reduce((sum, p) => sum + p.points, 0);
  const pct = max ? Math.max(0, Math.min(100, Math.round((score / max) * 100 - penaltyPoints))) : 0;
  return { score: pct, grade: pct >= 90 ? 'A' : pct >= 75 ? 'B' : pct >= 60 ? 'C' : 'D', checks, penalties };
}

async function fetchYahooChart(ticker) {
  const t = canonicalizeTicker(ticker);
  const symbol = /^[A-Z]{1,5}$/.test(t) ? t : `${t}.SA`;
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
  for (const host of hosts) {
    const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': browserHeaders(url)['User-Agent'], 'Accept': 'application/json' } });
      if (!res.ok) continue;
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      const meta = result?.meta || {};
      const price = meta.regularMarketPrice ?? meta.previousClose;
      const previous = meta.chartPreviousClose ?? meta.previousClose;
      const out = {};
      if (Number.isFinite(price)) out.precoAtual = price;
      if (Number.isFinite(price) && Number.isFinite(previous) && previous !== 0) {
        out.variacaoDay = `${(((price - previous) / previous) * 100).toFixed(2)}%`;
      }
      if (Object.keys(out).length) return { ok: true, data: out, source: 'YahooChart' };
    } catch {
      // ignora e tenta próximo host
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, data: {}, source: 'YahooChart', error: 'Yahoo Chart indisponível' };
}

async function fetchGoogleNews(ticker, aliases = [], limit = DEFAULT_NEWS_LIMIT) {
  const clean = canonicalizeTicker(ticker);
  const cacheKey = `news:${clean}:${aliases.join('|')}:${limit}`;
  const cached = newsCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < NEWS_CACHE_TTL_MS) return cached.value;

  const baseTerms = [`${clean}`, `${clean}.SA`, ...aliases]
    .map(s => String(s || '').trim())
    .filter(s => s && s.length >= 3)
    .slice(0, 8);
  const quotedAliases = baseTerms.map(term => term.includes(' ') ? `"${term}"` : term);
  const query = `(${quotedAliases.join(' OR ')}) (B3 OR ações OR ação OR bolsa OR dividendos OR proventos OR resultados OR balanço OR FII OR "fundo imobiliário")`;
  const params = new URLSearchParams({ q: query, hl: 'pt-BR', gl: 'BR', ceid: 'BR:pt-419' });
  const url = `https://news.google.com/rss/search?${params.toString()}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': browserHeaders(url)['User-Agent'], 'Accept': 'application/rss+xml,application/xml,text/xml' } });
    if (!res.ok) throw new Error(`Google News HTTP ${res.status}`);
    const xml = await res.text();
    const items = parseRssItems(xml).map(item => ({ ...item, query, relevanceScore: scoreNews(item, clean, baseTerms) }))
      .filter(item => item.relevanceScore > 0)
      .sort((a, b) => (b.relevanceScore - a.relevanceScore) || (new Date(b.pubDate || 0) - new Date(a.pubDate || 0)))
      .slice(0, limit);
    const value = { ok: true, items, source: 'GoogleNewsRSS', query };
    newsCache.set(cacheKey, { createdAt: Date.now(), value });
    return value;
  } catch (err) {
    return { ok: false, items: [], source: 'GoogleNewsRSS', query, error: err?.message || 'Falha no Google News' };
  } finally {
    clearTimeout(timer);
  }
}

function parseRssItems(xml) {
  const out = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) && out.length < 50) {
    const item = m[1];
    const title = decodeHtml(firstMatch(item, /<title>([\s\S]*?)<\/title>/i) || '');
    const link = decodeHtml(firstMatch(item, /<link>([\s\S]*?)<\/link>/i) || '');
    const pubRaw = decodeHtml(firstMatch(item, /<pubDate>([\s\S]*?)<\/pubDate>/i) || '');
    const source = decodeHtml(firstMatch(item, /<source[^>]*>([\s\S]*?)<\/source>/i) || '');
    const desc = stripTags(firstMatch(item, /<description>([\s\S]*?)<\/description>/i) || '');
    if (title && link) out.push({ title, link, pubDate: pubRaw ? new Date(pubRaw).toISOString() : undefined, source, snippet: desc });
  }
  return out;
}

function scoreNews(item, ticker, aliases) {
  const hay = `${item.title} ${item.snippet} ${item.source}`.toLowerCase();
  let score = 0;
  if (hay.includes(ticker.toLowerCase())) score += 10;
  if (hay.includes(`${ticker.toLowerCase()}.sa`)) score += 12;
  for (const alias of aliases) {
    const a = alias.toLowerCase();
    if (a.length >= 5 && hay.includes(a)) score += 3;
  }
  if (/dividend|provento|jcp|resultado|balanço|lucro|prejuízo|cotação|ação|bolsa|fii|fundo imobiliário/i.test(hay)) score += 3;
  return score;
}


export function clearValoraeCaches(scope = 'all') {
  const normalized = String(scope || 'all').toLowerCase();
  const before = getValoraeRuntimeStats().caches;
  if (normalized === 'all' || normalized === 'asset' || normalized === 'assetresult') {
    assetResultCache.clear();
    assetResultInFlight.clear();
    assetResultCacheBytes = 0;
    Object.keys(assetResultMetrics).forEach(k => { assetResultMetrics[k] = 0; });
  }
  if (normalized === 'all' || normalized === 'html') htmlCache.clear();
  if (normalized === 'all' || normalized === 'scrape' || normalized === 'scraperesponse') {
    valoraeScrapeResponseCache.clear();
    valoraeScrapeInFlight.clear();
    valoraeScrapeResponseCacheBytes = 0;
  }
  if (normalized === 'all' || normalized === 'news') newsCache.clear();
  return { ok: true, scope: normalized, before, after: getValoraeRuntimeStats().caches, clearedAt: nowIso() };
}

export function runValoraeSelfTest() {
  const checks = [];
  const add = (name, ok, detail = {}) => checks.push({ name, ok: Boolean(ok), ...detail });
  add('ticker-validation', validarTicker('PETR4') === null && validarTicker('GARE11') === null && validarTicker('^BVSP') !== null);
  add('asset-type-units', inferAssetType('TAEE11') === 'ACAO' && inferAssetType('GARE11') === 'FII');
  add('asset-type-etf', inferAssetType('BOVA11') === 'ETF');
  add('cache-stats', Boolean(getValoraeRuntimeStats()?.caches?.assetResult));
  add('performance-capabilities', Boolean(performanceCapabilities()?.profiles?.fast));
  add('schema-version', typeof VALORAE_SCHEMA_VERSION === 'string' && VALORAE_SCHEMA_VERSION.length > 8, { schemaVersion: VALORAE_SCHEMA_VERSION });
  const failed = checks.filter(c => !c.ok);
  return { ok: failed.length === 0, version: VALORAE_ENGINE_VERSION, checks, failed, checkedAt: nowIso() };
}

export class ValoraeEngine {
  static version = VALORAE_ENGINE_VERSION;

  static cacheStats() {
    return getValoraeRuntimeStats();
  }

  static async fetchAtivo(rawTicker, rawType, options = {}) {
    options = resolvePerformanceOptions(options, { endpoint: 'asset', ticker: rawTicker, type: rawType });
    const ticker = canonicalizeTicker(rawTicker);
    const validation = validarTicker(ticker);
    if (validation) throw new Error(validation);
    const type = rawType || inferAssetType(ticker);
    const cacheEnabled = assetResultCacheEnabled(options);
    const key = cacheEnabled ? assetResultCacheKey(ticker, type, options) : '';

    let staleBackup = null;
    if (cacheEnabled) {
      const cached = assetResultCacheGet(key);
      if (cached) {
        cached.cacheStatus = 'RESULT_CACHE_HIT';
        cached.metrics = { ...(cached.metrics || {}), resultCache: 'HIT', resultCacheServedAt: nowIso(), performanceProfile: options.performanceProfile };
        return cached;
      }
      staleBackup = assetResultCacheGet(key, { allowStale: true });
      const inFlight = assetResultInFlight.get(key);
      if (inFlight) {
        assetResultMetrics.inflightJoins += 1;
        const payload = deepClone(await inFlight);
        payload.cacheStatus = 'RESULT_CACHE_COALESCED';
        payload.metrics = { ...(payload.metrics || {}), resultCache: 'COALESCED', resultCacheServedAt: nowIso(), performanceProfile: options.performanceProfile };
        return payload;
      }
    }

    const promise = ValoraeEngine._fetchAtivoUncached(ticker, type, options);
    if (cacheEnabled) assetResultInFlight.set(key, promise);
    try {
      const payload = await promise;
      if (cacheEnabled && payload?.status !== 'ERROR') assetResultCacheSet(key, payload, Number(options.resultCacheTtlMs || ASSET_RESULT_CACHE_TTL_MS), Number(options.staleResultCacheMs || ASSET_RESULT_CACHE_STALE_MS));
      payload.cacheStatus = cacheEnabled ? 'RESULT_CACHE_MISS' : 'RESULT_CACHE_BYPASS';
      payload.metrics = { ...(payload.metrics || {}), resultCache: payload.cacheStatus, resultCacheTtlMs: cacheEnabled ? Number(options.resultCacheTtlMs || ASSET_RESULT_CACHE_TTL_MS) : 0, staleResultCacheMs: Number(options.staleResultCacheMs || ASSET_RESULT_CACHE_STALE_MS), performanceProfile: options.performanceProfile };
      return payload;
    } catch (err) {
      if (staleBackup && options.staleIfError !== false) {
        delete staleBackup.__cacheStale;
        staleBackup.cacheStatus = 'RESULT_CACHE_STALE_IF_ERROR';
        staleBackup.warnings = uniq([...(staleBackup.warnings || []), `Resposta servida do cache stale por falha de atualização: ${err?.message || 'erro desconhecido'}`]);
        staleBackup.metrics = { ...(staleBackup.metrics || {}), resultCache: 'STALE_IF_ERROR', resultCacheServedAt: nowIso(), performanceProfile: options.performanceProfile };
        return staleBackup;
      }
      throw err;
    } finally {
      if (cacheEnabled) assetResultInFlight.delete(key);
    }
  }

  static async _fetchAtivoUncached(rawTicker, rawType, options = {}) {
    const started = performance.now();
    const ticker = canonicalizeTicker(rawTicker);
    const validation = validarTicker(ticker);
    if (validation) throw new Error(validation);
    const type = rawType || inferAssetType(ticker);
    const includeNews = options.includeNews === true || options.includeNews === '1';
    const mode = options.mode || 'super';
    const warnings = [];
    const sourcesTried = [];
    let parse = null;
    let htmlFetch = null;

    const primaryUrls = investidor10Urls(ticker, type);
    if (!isProviderAvailable('Investidor10')) {
      const health = getProviderHealthSnapshot().Investidor10;
      warnings.push(`Investidor10 em cooldown temporário pelo circuit breaker; fallback será priorizado.`);
      sourcesTried.push({ name: 'Investidor10', provider: 'CircuitBreaker', status: 0, ok: false, blocked: false, error: 'Circuit breaker em cooldown', cooldownUntil: health?.cooldownUntil });
    } else {
      for (const url of primaryUrls) {
        const fetched = await fetchPublicHtml(url, {
          timeoutMs: options.timeoutMs,
          maxChars: options.maxHtmlChars,
          valoraeScrapeUrl: options.valoraeScrapeUrl,
          scrapeUrl: options.scrapeUrl,
          valoraeScrapeTimeoutMs: options.valoraeScrapeTimeoutMs,
          returnHtml: options.returnHtml !== false,
          includeScripts: options.returnHtml !== false,
          cache: options.cache !== false,
        });
        recordProviderResult('Investidor10', fetched.ok, { status: fetched.status, blocked: fetched.blocked, error: fetched.error });
        sourcesTried.push({ name: 'Investidor10', provider: fetched.provider, url, status: fetched.status, ok: fetched.ok, blocked: fetched.blocked, error: fetched.error, htmlLength: fetched.htmlLength, selectorResultKeys: fetched.selectorResultKeys, attempts: fetched.attempts });
        if (fetched.ok) {
          htmlFetch = fetched;
          if (fetched.html) {
            parse = parseInvestidor10Html(ticker, type, fetched.html, fetched.finalUrl || url);
            const selectorParse = parseSelectorResults(ticker, type, fetched.selectorResults || {});
            parse.results = mergeParsedResults(selectorParse.results, parse.results);
            parse.foundKeys = Object.keys(parse.results).filter(k => parse.results[k] !== undefined && parse.results[k] !== null && k !== 'sections');
          } else {
            const selectorParse = parseSelectorResults(ticker, type, fetched.selectorResults || {});
            if (selectorParse.foundKeys.length) {
              parse = { ...selectorParse, htmlBytesProcessed: 0, textBytesProcessed: 0, tableCount: 0, chartCandidateCount: 0, sourceUrl: fetched.finalUrl || url };
              warnings.push('ValoraeScrape retornou seletores sem HTML; resultado montado por seletores.');
            }
          }
          if (parse) break;
        }
      }
    }

    // StatusInvest é só fallback complementar, não substitui todas as seções do Investidor10.
    if (!parse && boolEnv('VALORAE_TRY_STATUSINVEST', true)) {
      if (!isProviderAvailable('StatusInvest')) {
        const health = getProviderHealthSnapshot().StatusInvest;
        sourcesTried.push({ name: 'StatusInvest', provider: 'CircuitBreaker', status: 0, ok: false, blocked: false, error: 'Circuit breaker em cooldown', cooldownUntil: health?.cooldownUntil });
      } else {
        for (const url of statusInvestUrls(ticker, type)) {
          const fetched = await fetchPublicHtml(url, {
            timeoutMs: options.timeoutMs,
            maxChars: Math.min(options.maxHtmlChars || DEFAULT_MAX_HTML_CHARS, 1_200_000),
            valoraeScrapeUrl: options.valoraeScrapeUrl,
            scrapeUrl: options.scrapeUrl,
            valoraeScrapeTimeoutMs: options.valoraeScrapeTimeoutMs,
            returnHtml: options.returnHtml !== false,
            includeScripts: options.returnHtml !== false,
            cache: options.cache !== false,
          });
          recordProviderResult('StatusInvest', fetched.ok, { status: fetched.status, blocked: fetched.blocked, error: fetched.error });
          sourcesTried.push({ name: 'StatusInvest', provider: fetched.provider, url, status: fetched.status, ok: fetched.ok, blocked: fetched.blocked, error: fetched.error, htmlLength: fetched.htmlLength, selectorResultKeys: fetched.selectorResultKeys, attempts: fetched.attempts });
          if (fetched.ok && fetched.html) {
            htmlFetch = fetched;
            parse = parseInvestidor10Html(ticker, type, fetched.html, fetched.finalUrl || url);
            parse.sourceUrl = fetched.finalUrl || url;
            warnings.push('Dados estruturados vieram de fallback HTML; algumas seções específicas do Investidor10 podem não existir nessa fonte.');
            break;
          }
        }
      }
    }

    let results = parse?.results || {};
    let source = parse ? (htmlFetch?.hostname?.includes('statusinvest') ? `${htmlFetch?.provider || 'Fetch'}+StatusInvestHTML` : `${htmlFetch?.provider || 'Fetch'}+Investidor10HTML`) : 'None';

    if (parse && htmlFetch?.html && htmlFetch?.hostname?.includes('investidor10')) {
      const { apiExtras, apiWarnings } = await fetchInvestidor10ApiExtras(ticker, type, htmlFetch.html, options);
      if (apiExtras && Object.keys(apiExtras).length) {
        results = applyApiExtrasToResults(results, apiExtras, type);
        if (apiExtras.apiStatus?.length) source = `${source}+Investidor10InternalAPIs`;
      }
      warnings.push(...(apiWarnings || []));
    }

    const hasUseful = Object.keys(results).filter(k => k !== 'sections').length > 0;
    let yahooQuote = null;
    if ((USE_YAHOO_FOR_CURRENT_QUOTE || !hasUseful) && options.useYahooFallback !== false) {
      yahooQuote = await fetchYahooChart(ticker);
      recordProviderResult('YahooChart', yahooQuote.ok, { error: yahooQuote.error });
      if (yahooQuote.ok) {
        results = hasUseful ? applyYahooQuoteToResults(results, yahooQuote) : { ...results, ...yahooQuote.data };
        source = source === 'None' ? yahooQuote.source : `${source}+${yahooQuote.source}`;
        if (!hasUseful) warnings.push('Retorno parcial: cotação via Yahoo Chart; HTML completo não foi processado.');
      }
    }

    results = postProcessResultsByType(ticker, type, results);
    results = enrichAssetResults(ticker, type, results);

    if (!parse) {
      const blocked = sourcesTried.find(s => s.blocked || s.status === 403 || s.status === 401 || s.status === 429);
      warnings.push(blocked ? `Scraping HTML indisponível ou bloqueado: ${blocked.error || 'HTTP ' + blocked.status}` : 'Scraping HTML indisponível.');
    }

    const aliases = [];
    if (results.nome) aliases.push(results.nome);
    if (/PETR/i.test(ticker)) aliases.push('Petrobras', 'Petróleo Brasileiro');
    if (/GARE/i.test(ticker)) aliases.push('Guardian Real Estate');
    const news = includeNews ? await fetchGoogleNews(ticker, aliases, Number(options.newsLimit || DEFAULT_NEWS_LIMIT)) : undefined;

    const foundKeys = Object.keys(results).filter(k => results[k] !== undefined && results[k] !== null && k !== 'sections');
    const htmlBytes = parse?.htmlBytesProcessed || 0;
    const partial = !parse || foundKeys.length < (type === 'FII' ? 8 : 10);
    const status = partial ? 'PARTIAL' : 'OK';
    if (!foundKeys.length) warnings.push('Nenhuma fonte retornou dados úteis para este ticker.');

    const coverage = buildCoverage(type, results);
    let payload = {
      schemaVersion: VALORAE_SCHEMA_VERSION,
      version: VALORAE_ENGINE_VERSION,
      status,
      partial,
      ticker,
      type,
      mode,
      results,
      cacheStatus: parse ? (htmlFetch?.html ? 'LIVE_HTML' : 'LIVE_SELECTOR') : 'ERROR',
      warnings: uniq(warnings),
      coverage,
      quality: buildQualityReport(type, results, coverage, uniq(warnings)),
      news: news?.items,
      newsStatus: includeNews ? { ok: news?.ok, source: news?.source, error: news?.error } : undefined,
      metrics: {
        engineVersion: VALORAE_ENGINE_VERSION,
        schemaVersion: VALORAE_SCHEMA_VERSION,
        totalTimeMs: Math.round(performance.now() - started),
        source,
        sourcesTried,
        htmlBytesProcessed: htmlBytes,
        textBytesProcessed: parse?.textBytesProcessed || 0,
        tableCount: parse?.tableCount || 0,
        chartCandidateCount: parse?.chartCandidateCount || 0,
        foundKeys,
        foundKeysCount: foundKeys.length,
        scrapeStatus: parse ? 'HTML_PARSED' : 'NO_HTML_DATA',
        scrapeError: !parse ? (sourcesTried.find(s => s.error)?.error || 'Sem HTML') : undefined,
        generatedAt: nowIso(),
        runtime: getValoraeRuntimeStats(),
        performanceProfile: options.performanceProfile || options.profile || 'standard',
        performanceHints: options.performanceHints,
        returnHtml: options.returnHtml !== false,
        internalApisEnabled: options.enableInternalApis !== false,
      },
      performance: {
        profile: options.performanceProfile || options.profile || 'standard',
        cachePolicy: options.cachePolicy || 'memory-lru-stale-if-error',
        hints: options.performanceHints,
      },
    };
    payload = applyResilienceWarnings(payload);
    payload.schemaStability = buildSchemaStability(payload);
    payload.validation = buildSchemaValidation(payload);
    payload.sourceReport = buildSourceReport(payload);
    payload.quality = augmentQualityReport(payload);
    payload.fieldConfidence = buildFieldConfidence(payload);
    payload.valoraeScore = buildValoraeScore(payload);
    payload.normalized = buildUniversalNormalized(payload);
    payload.dataQualityMatrix = buildAssetDataQualityMatrix(payload);
    payload.sourceReliability = buildSourceReliabilityMatrix(getValoraeRuntimeStats());
    if (payload.results?.dividendos) payload.dividendStats = normalizeDividendHistory(payload.results.dividendos);
    if (options.debug === true || options.debug === '1') payload.debug = buildDebugInfo(payload, { providerOrder: ['Investidor10', 'StatusInvest', 'YahooChart', 'GoogleNews'], includeRawHtml: false, providerHealth: getProviderHealthSnapshot() });
    payload = applyPayloadView(payload, options.view || 'full', { includeQuality: options.includeQuality !== false, includeDebug: options.debug === true || options.debug === '1' });
    return payload;
  }

  static async fetchAtivosBatch(tickers, options = {}) {
    options = resolvePerformanceOptions(options, { endpoint: 'assets', batchSize: Array.isArray(tickers) ? tickers.length : 0 });
    const started = performance.now();
    const maxConcurrency = Math.max(1, Math.min(Number(options.maxConcurrency || options.concurrency || intEnv('VALORAE_BATCH_CONCURRENCY', 4)), Number(options.maxConcurrencyHardLimit || 8)));
    const queue = tickers.map(canonicalizeTicker);
    const assets = [];
    const errors = [];
    let cursor = 0;
    async function worker() {
      while (cursor < queue.length) {
        const i = cursor++;
        const ticker = queue[i];
        try {
          const type = inferAssetType(ticker);
          const data = await ValoraeEngine.fetchAtivo(ticker, type, options);
          assets[i] = data;
        } catch (err) {
          errors.push({ ticker, error: err?.message || 'Erro desconhecido' });
          if (options.continueOnError === false) throw err;
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(maxConcurrency, queue.length) }, worker));
    const cleanAssets = assets.filter(Boolean);
    const stats = {
      requested: queue.length,
      success: cleanAssets.filter(a => a.status === 'OK').length,
      partial: cleanAssets.filter(a => a.partial).length,
      failed: errors.length,
      durationMs: Math.round(performance.now() - started),
      maxConcurrency,
      cacheHits: cleanAssets.filter(a => /HIT/.test(String(a.cacheStatus || a.metrics?.resultCache || ''))).length,
      averageQualityScore: cleanAssets.length ? Math.round(cleanAssets.reduce((sum, a) => sum + Number(a.quality?.score || 0), 0) / cleanAssets.length) : 0,
      grades: cleanAssets.reduce((acc, a) => { const g = a.quality?.grade || 'NA'; acc[g] = (acc[g] || 0) + 1; return acc; }, {}),
      performanceProfile: options.performanceProfile || options.profile || 'portfolio',
      selectorOnly: options.returnHtml === false
    };
    return { version: VALORAE_ENGINE_VERSION, assets: cleanAssets, errors, stats };
  }

  static async fetchNews(ticker, aliases = [], options = {}) {
    return fetchGoogleNews(ticker, aliases, Number(options.limit || DEFAULT_NEWS_LIMIT));
  }

  static async scrapeUrl(url, options = {}) {
    return fetchPublicHtml(url, options);
  }
}

export default ValoraeEngine;
