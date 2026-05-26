// Small in-memory LRU cache with in-flight de-duplication for market endpoints.
// Serverless-safe: optional, bounded, no filesystem/database dependency.

export const VALORAE_MARKET_CACHE_VERSION = '21.5.13-mature-final-release-free';

const stores = new Map();
const inflight = new Map();
const metrics = { hits: 0, misses: 0, staleHits: 0, sets: 0, evictions: 0, inflightJoins: 0 };

function now() { return Date.now(); }
function bytesOf(value) {
  try { return Buffer.byteLength(JSON.stringify(value), 'utf8'); } catch { return 0; }
}
function getStore(name) {
  const key = String(name || 'default');
  if (!stores.has(key)) stores.set(key, { entries: new Map(), bytes: 0 });
  return stores.get(key);
}
function deleteEntry(store, key) {
  const entry = store.entries.get(key);
  if (!entry) return;
  store.bytes = Math.max(0, store.bytes - (entry.bytes || 0));
  store.entries.delete(key);
}
export function getCachedMarketValue(namespace, key, { allowStale = false } = {}) {
  const store = getStore(namespace);
  const entry = store.entries.get(key);
  if (!entry) { metrics.misses += 1; return null; }
  const t = now();
  const fresh = t <= entry.expiresAt;
  const stale = allowStale && t <= entry.staleUntil;
  if (!fresh && !stale) {
    deleteEntry(store, key);
    metrics.misses += 1;
    return null;
  }
  store.entries.delete(key);
  store.entries.set(key, entry);
  if (fresh) metrics.hits += 1; else metrics.staleHits += 1;
  return { data: entry.data, cache: fresh ? 'HIT' : 'STALE' };
}
export function setCachedMarketValue(namespace, key, data, { ttlMs = 60_000, staleMs = 300_000, maxEntries = 200, maxBytes = 8 * 1024 * 1024 } = {}) {
  if (!key || !data || ttlMs <= 0) return;
  const store = getStore(namespace);
  const entryBytes = bytesOf(data);
  if (entryBytes > maxBytes) return;
  deleteEntry(store, key);
  while (store.entries.size >= maxEntries || store.bytes + entryBytes > maxBytes) {
    const oldest = store.entries.keys().next().value;
    if (!oldest) break;
    deleteEntry(store, oldest);
    metrics.evictions += 1;
  }
  const expiresAt = now() + ttlMs;
  store.entries.set(key, { data, bytes: entryBytes, expiresAt, staleUntil: expiresAt + Math.max(0, staleMs) });
  store.bytes += entryBytes;
  metrics.sets += 1;
}
export async function withMarketInflight(namespace, key, fn) {
  const fullKey = `${namespace}:${key}`;
  if (inflight.has(fullKey)) { metrics.inflightJoins += 1; return inflight.get(fullKey); }
  const p = Promise.resolve().then(fn);
  inflight.set(fullKey, p);
  try { return await p; } finally { inflight.delete(fullKey); }
}
export function marketCacheStats() {
  const out = {};
  for (const [name, store] of stores) out[name] = { entries: store.entries.size, bytes: store.bytes };
  return { version: VALORAE_MARKET_CACHE_VERSION, stores: out, inflight: inflight.size, metrics: { ...metrics }, hitRate: metrics.hits + metrics.misses ? Math.round(metrics.hits / (metrics.hits + metrics.misses) * 10000) / 100 : null };
}
