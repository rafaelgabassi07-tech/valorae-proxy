import { decorateHistoryWithB3Calendar, normalizeB3Range } from './b3-calendar.js';
import { getCachedMarketValue, setCachedMarketValue, withMarketInflight } from './cache.js';

export const VALORAE_YAHOO_MARKET_VERSION = '21.5.13-mature-final-release-free';

const HISTORY_TTL_MS = Number(process.env.VALORAE_YAHOO_HISTORY_TTL_MS || 60 * 1000);
const HISTORY_STALE_MS = Number(process.env.VALORAE_YAHOO_HISTORY_STALE_MS || 10 * 60 * 1000);
const QUOTE_TTL_MS = Number(process.env.VALORAE_YAHOO_QUOTE_TTL_MS || 20 * 1000);
const QUOTE_STALE_MS = Number(process.env.VALORAE_YAHOO_QUOTE_STALE_MS || 2 * 60 * 1000);

export function canonicalTicker(raw = '') { return String(raw).replace(/\.SA$/i,'').trim().toUpperCase(); }
export function yahooSymbol(ticker = '') {
  const t = canonicalTicker(ticker);
  if (/^\^/.test(t) || /^[A-Z]{1,5}=X$/.test(t)) return t;
  if (/^[A-Z]{1,5}$/.test(t)) return t;
  return `${t}.SA`;
}

export const RANGE_MAP = {
  '1D': { range: '1d', interval: '5m' },
  '5D': { range: '5d', interval: '15m' },
  '1M': { range: '1mo', interval: '1d' },
  '3M': { range: '3mo', interval: '1d' },
  '6M': { range: '6mo', interval: '1d' },
  'YTD': { range: 'ytd', interval: '1d' },
  '1Y': { range: '1y', interval: '1d' },
  '2Y': { range: '2y', interval: '1d' },
  '5Y': { range: '5y', interval: '1wk' },
  '10Y': { range: '10y', interval: '1mo' },
  'MAX': { range: 'max', interval: '1mo' },
};

function limitPoints(points = [], limit) {
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0 || points.length <= n) return points;
  return points.slice(-Math.floor(n));
}

function summary(points = []) {
  const prices = points.map(p => p.close).filter(Number.isFinite);
  if (!prices.length) return {};
  const first = prices[0], last = prices[prices.length - 1];
  const min = Math.min(...prices), max = Math.max(...prices);
  const volumes = points.map(p => p.volume).filter(Number.isFinite);
  return {
    firstClose: first,
    lastClose: last,
    min,
    max,
    variationPct: first ? Number((((last-first)/first)*100).toFixed(2)) : undefined,
    points: points.length,
    totalVolume: volumes.length ? volumes.reduce((a, b) => a + b, 0) : undefined,
    averageVolume: volumes.length ? Math.round(volumes.reduce((a, b) => a + b, 0) / volumes.length) : undefined,
  };
}

async function fetchYahooHistoryNetwork(ticker, { range = '1Y', interval, timeoutMs = 9000, limit } = {}) {
  const normalizedRange = normalizeB3Range(range);
  const chosen = RANGE_MAP[normalizedRange] || RANGE_MAP['1Y'];
  const symbol = yahooSymbol(ticker);
  const params = new URLSearchParams({ range: chosen.range, interval: interval || chosen.interval, includePrePost: 'false', events: 'div,splits' });
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
  let lastError = null;
  for (const host of hosts) {
    const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?${params.toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': process.env.VALORAE_USER_AGENT || 'Mozilla/5.0', 'Accept': 'application/json' } });
      if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result) throw new Error(json?.chart?.error?.description || 'Yahoo sem result');
      const ts = result.timestamp || [];
      const q = result.indicators?.quote?.[0] || {};
      const adj = result.indicators?.adjclose?.[0]?.adjclose || [];
      const rawPoints = ts.map((t, i) => ({
        date: new Date(t * 1000).toISOString(),
        open: q.open?.[i] ?? null,
        high: q.high?.[i] ?? null,
        low: q.low?.[i] ?? null,
        close: q.close?.[i] ?? null,
        volume: q.volume?.[i] ?? null,
        adjClose: adj[i] ?? null,
      })).filter(p => Number.isFinite(p.close));
      const points = limitPoints(rawPoints, limit);
      const marketCalendar = decorateHistoryWithB3Calendar(points);
      return {
        ok: true,
        ticker: canonicalTicker(ticker),
        symbol,
        requestedRange: String(range || '1Y'),
        range: normalizedRange,
        yahooRange: chosen.range,
        interval: interval || chosen.interval,
        source: 'YahooChart',
        sourceVersion: VALORAE_YAHOO_MARKET_VERSION,
        currency: result.meta?.currency,
        timezone: result.meta?.timezone,
        regularMarketPrice: result.meta?.regularMarketPrice,
        previousClose: result.meta?.chartPreviousClose ?? result.meta?.previousClose,
        summary: { ...summary(points), marketCalendar: marketCalendar.calendar, lastTradingPointDate: marketCalendar.lastPointDate },
        marketCalendar,
        points,
        events: result.events || {},
        rawPointsCount: rawPoints.length,
        cache: 'MISS',
      };
    } catch (err) {
      lastError = err;
    } finally { clearTimeout(timer); }
  }
  return { ok: false, ticker: canonicalTicker(ticker), symbol, requestedRange: String(range || '1Y'), range: normalizedRange, source: 'YahooChart', sourceVersion: VALORAE_YAHOO_MARKET_VERSION, error: lastError?.message || 'Yahoo indisponível', points: [], summary: {}, marketCalendar: decorateHistoryWithB3Calendar([]), cache: 'MISS' };
}

export async function fetchYahooHistory(ticker, opts = {}) {
  const { range = '1Y', interval, limit } = opts;
  const normalizedRange = normalizeB3Range(range);
  const symbol = yahooSymbol(ticker);
  const key = JSON.stringify({ symbol, range: normalizedRange, interval: interval || '', limit: Number(limit || 0) });
  if (opts.bypassCache !== true && opts.cache !== false) {
    const hit = getCachedMarketValue('yahoo-history', key, { allowStale: false });
    if (hit) return { ...hit.data, cache: hit.cache };
  }
  return withMarketInflight('yahoo-history', key, async () => {
    const data = await fetchYahooHistoryNetwork(ticker, opts);
    if (data.ok) {
      setCachedMarketValue('yahoo-history', key, data, { ttlMs: HISTORY_TTL_MS, staleMs: HISTORY_STALE_MS, maxEntries: 350, maxBytes: 12 * 1024 * 1024 });
      return data;
    }
    const stale = getCachedMarketValue('yahoo-history', key, { allowStale: true });
    if (stale) return { ...stale.data, ok: true, cache: 'STALE_IF_ERROR', warning: data.error };
    return data;
  });
}

export async function fetchYahooQuote(symbol, opts = {}) {
  const cacheKey = JSON.stringify({ symbol: yahooSymbol(symbol), quote: true });
  if (opts.bypassCache !== true && opts.cache !== false) {
    const hit = getCachedMarketValue('yahoo-quote', cacheKey, { allowStale: false });
    if (hit) return { ...hit.data, cache: hit.cache };
  }
  return withMarketInflight('yahoo-quote', cacheKey, async () => {
    const data = await fetchYahooHistory(symbol, { ...opts, range: '1D', interval: '5m' });
    if (!data.ok) {
      const stale = getCachedMarketValue('yahoo-quote', cacheKey, { allowStale: true });
      if (stale) return { ...stale.data, ok: true, cache: 'STALE_IF_ERROR', warning: data.error };
      return data;
    }
    const last = data.points[data.points.length - 1];
    const prev = data.previousClose;
    const quote = { ok: true, symbol: data.symbol, price: last?.close ?? data.regularMarketPrice, previousClose: prev, variationPct: prev && last?.close ? Number((((last.close - prev) / prev) * 100).toFixed(2)) : undefined, source: 'YahooChart', time: last?.date, marketCalendar: data.marketCalendar, cache: data.cache };
    setCachedMarketValue('yahoo-quote', cacheKey, quote, { ttlMs: QUOTE_TTL_MS, staleMs: QUOTE_STALE_MS, maxEntries: 250, maxBytes: 2 * 1024 * 1024 });
    return quote;
  });
}
