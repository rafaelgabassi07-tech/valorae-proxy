import { getCachedMarketValue, setCachedMarketValue, withMarketInflight } from './cache.js';

export const VALORAE_BCB_MARKET_VERSION = '21.5.13-mature-final-release-free';
const BCB_TTL_MS = Number(process.env.VALORAE_BCB_CACHE_TTL_MS || 60 * 60 * 1000);
const BCB_STALE_MS = Number(process.env.VALORAE_BCB_CACHE_STALE_MS || 24 * 60 * 60 * 1000);

async function fetchBcbSeriesNetwork(seriesId, { last = 12, timeoutMs = 9000 } = {}) {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${encodeURIComponent(seriesId)}/dados/ultimos/${encodeURIComponent(last)}?formato=json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'Accept': 'application/json', 'User-Agent': process.env.VALORAE_USER_AGENT || 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`BCB HTTP ${res.status}`);
    const rows = await res.json();
    return { ok: true, source: 'BancoCentralSGS', sourceVersion: VALORAE_BCB_MARKET_VERSION, seriesId, points: rows.map(r => ({ date: r.data, value: Number(String(r.valor).replace(',','.')) })).filter(x => Number.isFinite(x.value)), cache: 'MISS' };
  } catch (err) {
    return { ok: false, source: 'BancoCentralSGS', sourceVersion: VALORAE_BCB_MARKET_VERSION, seriesId, error: err?.message || 'BCB indisponível', points: [], cache: 'MISS' };
  } finally { clearTimeout(timer); }
}

export async function fetchBcbSeries(seriesId, { last = 12, timeoutMs = 9000, bypassCache = false, cache = true } = {}) {
  const key = JSON.stringify({ seriesId: String(seriesId), last: Number(last || 12) });
  if (!bypassCache && cache !== false) {
    const hit = getCachedMarketValue('bcb', key, { allowStale: false });
    if (hit) return { ...hit.data, cache: hit.cache };
  }
  return withMarketInflight('bcb', key, async () => {
    const data = await fetchBcbSeriesNetwork(seriesId, { last, timeoutMs });
    if (data.ok) {
      setCachedMarketValue('bcb', key, data, { ttlMs: BCB_TTL_MS, staleMs: BCB_STALE_MS, maxEntries: 120, maxBytes: 3 * 1024 * 1024 });
      return data;
    }
    const stale = getCachedMarketValue('bcb', key, { allowStale: true });
    if (stale) return { ...stale.data, ok: true, cache: 'STALE_IF_ERROR', warning: data.error };
    return data;
  });
}

export async function fetchIpca({ last = 24, timeoutMs = 9000, bypassCache = false, cache = true } = {}) {
  const data = await fetchBcbSeries(433, { last, timeoutMs, bypassCache, cache });
  const points = data.points || [];
  const accumulated12m = points.slice(-12).reduce((acc, p) => acc * (1 + p.value / 100), 1) - 1;
  return { ...data, name: 'IPCA mensal', accumulated12mPct: points.length >= 12 ? Number((accumulated12m * 100).toFixed(2)) : undefined, lastValue: points.at(-1) || null };
}
