const DEFAULT_FAILURE_THRESHOLD = Number(process.env.VALORAE_CIRCUIT_FAILURE_THRESHOLD || 4);
const DEFAULT_COOLDOWN_MS = Number(process.env.VALORAE_CIRCUIT_COOLDOWN_MS || 5 * 60 * 1000);
const DEFAULT_SUCCESS_RESET = Number(process.env.VALORAE_CIRCUIT_SUCCESS_RESET || 2);
const state = new Map();

function entry(name) {
  const key = String(name || 'unknown');
  if (!state.has(key)) state.set(key, { provider: key, status: 'healthy', failures: 0, successes: 0, openedAt: null, cooldownUntil: null, lastError: null, lastStatus: null, updatedAt: null });
  return state.get(key);
}

export function isProviderAvailable(name) {
  const e = entry(name);
  if (e.status !== 'degraded') return true;
  if (!e.cooldownUntil) return true;
  if (Date.now() >= new Date(e.cooldownUntil).getTime()) {
    e.status = 'half-open';
    e.updatedAt = new Date().toISOString();
    return true;
  }
  return false;
}

export function recordProviderResult(name, ok, detail = {}) {
  const e = entry(name);
  e.updatedAt = new Date().toISOString();
  e.lastStatus = detail.status ?? e.lastStatus;
  if (ok) {
    e.successes += 1;
    e.failures = 0;
    e.lastError = null;
    if (e.status === 'half-open' || e.status === 'degraded') {
      if (e.successes >= DEFAULT_SUCCESS_RESET || e.status === 'half-open') {
        e.status = 'healthy';
        e.openedAt = null;
        e.cooldownUntil = null;
      }
    } else {
      e.status = 'healthy';
    }
    return e;
  }
  const severe = detail.blocked || [401,403,408,425,429,500,502,503,504].includes(Number(detail.status || 0)) || !detail.status;
  if (severe) e.failures += 1;
  e.successes = 0;
  e.lastError = detail.error || `HTTP ${detail.status || 0}`;
  if (e.failures >= DEFAULT_FAILURE_THRESHOLD) {
    e.status = 'degraded';
    e.openedAt = new Date().toISOString();
    e.cooldownUntil = new Date(Date.now() + DEFAULT_COOLDOWN_MS).toISOString();
  }
  return e;
}

export const noteProviderResult = recordProviderResult;

export function getProviderHealthSnapshot() {
  const out = {};
  for (const [key, value] of state.entries()) out[key] = { ...value };
  for (const key of ['Investidor10','StatusInvest','YahooChart','GoogleNews','BancoCentral','YahooHistory']) {
    if (!out[key]) out[key] = { ...entry(key) };
  }
  return out;
}

export function resetProviderHealth(name) {
  if (name) state.delete(name);
  else state.clear();
}
