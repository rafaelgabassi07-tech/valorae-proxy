import { fetchYahooQuote } from './yahoo.js';
import { getCachedMarketValue, setCachedMarketValue, withMarketInflight } from './cache.js';

export const VALORAE_INDICES_MARKET_VERSION = '21.5.13-mature-final-release-free';
const INDICES_TTL_MS = Number(process.env.VALORAE_INDICES_CACHE_TTL_MS || 30 * 1000);
const INDICES_STALE_MS = Number(process.env.VALORAE_INDICES_CACHE_STALE_MS || 5 * 60 * 1000);

const INDEX_SYMBOLS = {
  IBOV: '^BVSP',
  BOVA11: 'BOVA11.SA',
  SMAL11: 'SMAL11.SA',
  IVVB11: 'IVVB11.SA',
  DIVO11: 'DIVO11.SA',
  IFIX_PROXY: 'XFIX11.SA'
};

export async function fetchIndicesSnapshot({ symbols = INDEX_SYMBOLS, bypassCache = false, cache = true } = {}) {
  const key = JSON.stringify(symbols);
  if (!bypassCache && cache !== false) {
    const hit = getCachedMarketValue('indices', key, { allowStale: false });
    if (hit) return { ...hit.data, cache: hit.cache };
  }
  return withMarketInflight('indices', key, async () => {
    const entries = Object.entries(symbols || INDEX_SYMBOLS);
    const rows = await Promise.all(entries.map(async ([key, symbol]) => {
      const q = await fetchYahooQuote(symbol);
      return { name: key, symbol, ok: q.ok, price: q.price, previousClose: q.previousClose, variationPct: q.variationPct, source: q.source, error: q.error, time: q.time, cache: q.cache };
    }));
    const data = { ok: rows.some(r => r.ok), source: 'YahooChart', sourceVersion: VALORAE_INDICES_MARKET_VERSION, generatedAt: new Date().toISOString(), indices: rows, cache: 'MISS' };
    if (data.ok) {
      setCachedMarketValue('indices', key, data, { ttlMs: INDICES_TTL_MS, staleMs: INDICES_STALE_MS, maxEntries: 50, maxBytes: 1024 * 1024 });
      return data;
    }
    const stale = getCachedMarketValue('indices', key, { allowStale: true });
    if (stale) return { ...stale.data, ok: true, cache: 'STALE_IF_ERROR', warning: 'Índices atuais indisponíveis; retornando snapshot stale.' };
    return data;
  });
}
