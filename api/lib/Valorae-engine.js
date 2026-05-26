// Valorae-engine.js
// Motor novo do Valorae Proxy para Vercel/GitHub.
// Foco: dados públicos de ações/FIIs, diagnóstico claro, sem dados sintéticos.

export const VALORAE_ENGINE_VERSION = '19.6.0-super-parser';

const DEFAULT_TIMEOUT_MS = intEnv('VALORAE_FETCH_TIMEOUT_MS', 12000);
const DEFAULT_MAX_HTML_CHARS = intEnv('VALORAE_MAX_HTML_CHARS', 3_200_000);
const DEFAULT_NEWS_LIMIT = intEnv('VALORAE_NEWS_LIMIT', 8);
const NEWS_CACHE_TTL_MS = intEnv('VALORAE_NEWS_CACHE_TTL_MS', 15 * 60 * 1000);
const HTML_CACHE_TTL_MS = intEnv('VALORAE_HTML_CACHE_TTL_MS', 2 * 60 * 1000);
const ENABLE_INVESTIDOR10_INTERNAL_APIS = boolEnv('VALORAE_ENABLE_INTERNAL_APIS', true);
const USE_YAHOO_FOR_CURRENT_QUOTE = boolEnv('VALORAE_USE_YAHOO_FOR_CURRENT_QUOTE', true);

// Camada ValoraeScrape self-contained.
// Em produção, /api/asset chama o próprio /api/scrape do mesmo domínio,
// que retorna HTML + seletores. Não depende de serviço externo de scraping.
const ENV_VALORAE_SCRAPE_URL = (process.env.VALORAE_SCRAPE_URL || '').trim();
const VALORAE_SCRAPE_TIMEOUT_MS = intEnv('VALORAE_SCRAPE_TIMEOUT_MS', 12000);
const VALORAE_SCRAPE_RETRIES = intEnv('VALORAE_SCRAPE_RETRIES', 2);
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

function validateUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('URL inválida'); }
  if (parsed.protocol !== 'https:') throw new Error('Apenas URLs HTTPS são permitidas');
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
        returnHtml: true,
        includeScripts: options.includeScripts ?? true,
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

function sectionSlice(text, headings, nextHeadings = [], maxLen = 7000) {
  const lower = text.toLowerCase();
  let start = -1;
  let used = '';
  for (const h of headings) {
    const idx = lower.indexOf(h.toLowerCase());
    if (idx !== -1 && (start === -1 || idx < start)) { start = idx; used = h; }
  }
  if (start === -1) return { heading: '', text: '' };
  let end = Math.min(text.length, start + maxLen);
  for (const h of nextHeadings) {
    const idx = lower.indexOf(h.toLowerCase(), start + used.length + 20);
    if (idx !== -1 && idx < end) end = idx;
  }
  return { heading: used, text: text.slice(start, end).trim() };
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


function cleanAboutCandidate(text = '') {
  const compact = stripTags(text).replace(/\s+/g, ' ').trim();
  if (compact.length < 80) return '';
  if (/Preço Justo|Graham|Bazin|Radar de Dividendos|Calculadora|Comparador de/i.test(compact)) return '';
  if (/Publicado em|ADICIONAR NA CARTEIRA|Saiba mais/i.test(compact) && compact.length < 500) return '';
  return compact.slice(0, 4500);
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

function safeParseJson(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  try { return JSON.parse(s); } catch {}
  try { return JSON.parse(decodeHtml(s)); } catch {}
  try { return Function(`"use strict";return (${s});`)(); } catch {}
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
  if (!ENABLE_INVESTIDOR10_INTERNAL_APIS) return { apiExtras: {}, apiWarnings: [] };
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
  if (logos[0]) out.logoUrl = String(logos[0]).startsWith('/') ? `https://investidor10.com.br${logos[0]}` : String(logos[0]);
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
  const baseFields = type === 'FII' ? applyFields(compact, FII_FIELDS) : applyFields(compact, ACAO_FIELDS);
  const cnpj = extractCnpj(compact);
  if (cnpj) baseFields.cnpj = cnpj;
  const h1 = getH1(html);
  const pageTitle = getPageTitle(html);
  if (h1) baseFields.nome = h1;
  else if (pageTitle) baseFields.nome = pageTitle;

  const aboutCompany = extractAboutCompany(html, text, ticker, type);
  if (aboutCompany) baseFields.sobre = aboutCompany;

  const dividendos = extractDividendHistory(compact);
  if (dividendos.length) baseFields.historicoDividendos = dividendos;

  const genericSections = extractGenericSectionData(text, tables);
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

  if (type === 'FII') {
    sections.listaImoveis = extractImoveis(text, tables);
    sections.informacoesFundo = pick(baseFields, [
      'cnpj','numeroCotistas','cotasEmitidas','taxaAdministracao','tipoFundo','segmentoFii','mandato','publicoAlvo','tipoGestao','prazoDuracao','vacanciaFisica','vacanciaFinanceira'
    ]);
    sections.distribuicoes12m = pick(baseFields, ['yield1m','yield3m','yield6m','yield12m','totalDividendos12m','ultimoRendimento']);
    sections.mediaTipoSegmento = genericSections.mediaTipoSegmento || pick(baseFields, ['pvpMedioTipo','dyMedioTipo']);
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


function mergeParsedResults(primary = {}, secondary = {}) {
  // primary = seletores próximos ao DOM; secondary = parser amplo do HTML.
  // Mantém os campos de maior precisão dos seletores e usa o HTML amplo para completar o resto.
  const merged = { ...secondary, ...primary };
  if (primary.sections || secondary.sections) {
    merged.sections = mergeSectionsDeep(secondary.sections || {}, primary.sections || {});
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

async function fetchYahooChart(ticker) {
  const t = canonicalizeTicker(ticker);
  const symbol = /^[A-Z]{1,5}$/.test(t) ? t : `${t}.SA`;
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
  for (const host of hosts) {
    const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1m`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': browserHeaders(url)['User-Agent'], 'Accept': 'application/json' } });
      clearTimeout(timer);
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
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': browserHeaders(url)['User-Agent'], 'Accept': 'application/rss+xml,application/xml,text/xml' } });
    clearTimeout(timer);
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

export class ValoraeEngine {
  static version = VALORAE_ENGINE_VERSION;

  static async fetchAtivo(rawTicker, rawType, options = {}) {
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
    for (const url of primaryUrls) {
      const fetched = await fetchPublicHtml(url, { timeoutMs: options.timeoutMs, maxChars: options.maxHtmlChars, valoraeScrapeUrl: options.valoraeScrapeUrl, scrapeUrl: options.scrapeUrl });
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

    // StatusInvest é só fallback complementar, não substitui todas as seções do Investidor10.
    if (!parse && boolEnv('VALORAE_TRY_STATUSINVEST', true)) {
      for (const url of statusInvestUrls(ticker, type)) {
        const fetched = await fetchPublicHtml(url, { timeoutMs: options.timeoutMs, maxChars: Math.min(options.maxHtmlChars || DEFAULT_MAX_HTML_CHARS, 1_200_000), valoraeScrapeUrl: options.valoraeScrapeUrl, scrapeUrl: options.scrapeUrl });
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
      if (yahooQuote.ok) {
        results = hasUseful ? applyYahooQuoteToResults(results, yahooQuote) : { ...results, ...yahooQuote.data };
        source = source === 'None' ? yahooQuote.source : `${source}+${yahooQuote.source}`;
        if (!hasUseful) warnings.push('Retorno parcial: cotação via Yahoo Chart; HTML completo não foi processado.');
      }
    }

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

    return {
      version: VALORAE_ENGINE_VERSION,
      status,
      partial,
      ticker,
      type,
      mode,
      results,
      cacheStatus: parse ? 'LIVE_HTML' : 'ERROR',
      warnings: uniq(warnings),
      coverage: buildCoverage(type, results),
      news: news?.items,
      newsStatus: includeNews ? { ok: news?.ok, source: news?.source, error: news?.error } : undefined,
      metrics: {
        engineVersion: VALORAE_ENGINE_VERSION,
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
      },
    };
  }

  static async fetchAtivosBatch(tickers, options = {}) {
    const maxConcurrency = Number(options.concurrency || intEnv('VALORAE_BATCH_CONCURRENCY', 4));
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
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(maxConcurrency, queue.length) }, worker));
    return { assets: assets.filter(Boolean), errors };
  }

  static async fetchNews(ticker, aliases = [], options = {}) {
    return fetchGoogleNews(ticker, aliases, Number(options.limit || DEFAULT_NEWS_LIMIT));
  }

  static async scrapeUrl(url, options = {}) {
    return fetchPublicHtml(url, options);
  }
}

export default ValoraeEngine;
