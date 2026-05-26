export class TtlLruCache {
  constructor({ maxEntries = 250, maxBytes = 32 * 1024 * 1024, ttlMs = 5 * 60 * 1000, name = 'cache' } = {}) {
    this.name = name;
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
    this.ttlMs = ttlMs;
    this.map = new Map();
    this.bytes = 0;
    this.metrics = { hits: 0, misses: 0, staleHits: 0, sets: 0, evictions: 0, deletes: 0, skippedOversize: 0 };
  }
  get(key, { allowStale = false } = {}) {
    const entry = this.map.get(key);
    if (!entry) { this.metrics.misses += 1; return undefined; }
    const now = Date.now();
    const isStale = now > entry.expiresAt;
    if (isStale && !allowStale) { this.delete(key); this.metrics.misses += 1; return undefined; }
    this.map.delete(key);
    this.map.set(key, entry);
    if (isStale) this.metrics.staleHits += 1; else this.metrics.hits += 1;
    const value = structuredCloneSafe(entry.value);
    if (value && typeof value === 'object') {
      value.cacheAgeMs = now - entry.createdAt;
      value.cacheExpiresInMs = Math.max(0, entry.expiresAt - now);
      if (isStale) value.staleReason = 'ttl-expired-allowed';
    }
    return value;
  }
  set(key, value, ttlMs = this.ttlMs) {
    const bytes = Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
    if (bytes > this.maxBytes) { this.metrics.skippedOversize += 1; return false; }
    this.delete(key, { countMetric: false });
    while (this.map.size >= this.maxEntries || this.bytes + bytes > this.maxBytes) {
      const oldest = this.map.keys().next().value;
      if (!oldest) break;
      this.delete(oldest, { eviction: true });
    }
    this.map.set(key, { value: structuredCloneSafe(value), bytes, expiresAt: Date.now() + ttlMs, createdAt: Date.now() });
    this.bytes += bytes;
    this.metrics.sets += 1;
    return true;
  }
  delete(key, options = {}) {
    const entry = this.map.get(key);
    if (!entry) return false;
    this.bytes = Math.max(0, this.bytes - entry.bytes);
    if (options.eviction) this.metrics.evictions += 1;
    else if (options.countMetric !== false) this.metrics.deletes += 1;
    return this.map.delete(key);
  }
  clear() { this.map.clear(); this.bytes = 0; }
  stats() {
    const total = this.metrics.hits + this.metrics.misses;
    return { name: this.name, entries: this.map.size, bytes: this.bytes, ttlMs: this.ttlMs, maxEntries: this.maxEntries, maxBytes: this.maxBytes, metrics: { ...this.metrics }, hitRate: total ? Math.round((this.metrics.hits / total) * 10000) / 100 : null };
  }
}

export function structuredCloneSafe(value) {
  if (value === undefined || value === null) return value;
  try { return globalThis.structuredClone(value); } catch { return JSON.parse(JSON.stringify(value)); }
}

export function cacheDriverInfo() {
  const requested = String(process.env.VALORAE_CACHE_DRIVER || 'memory').toLowerCase();
  const externalRequested = ['redis','kv','vercel-kv','external'].includes(requested);
  return {
    driver: 'memory',
    requestedDriver: requested,
    persistent: false,
    configured: true,
    freeOnly: true,
    externalRequested,
    warning: externalRequested ? 'Driver/cache externo ignorado: esta build free-only usa apenas cache em memória.' : undefined,
    note: 'Cache em memória, limitado e serverless-safe; pode zerar quando a instância esfriar.'
  };
}
