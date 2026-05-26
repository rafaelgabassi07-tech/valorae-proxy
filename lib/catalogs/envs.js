import { ENV_CATALOG, VALORAE_CATALOG_VERSION } from './valorae-catalogs.js';

export function runtimeEnvReport(env = process.env) {
  return ENV_CATALOG.map(item => ({
    ...item,
    configured: env[item.name] !== undefined && env[item.name] !== '',
    valuePreview: env[item.name] ? String(env[item.name]).slice(0, 3) + '***' : undefined,
  }));
}

export function envCatalogSummary(env = process.env) {
  const rows = runtimeEnvReport(env);
  return {
    version: VALORAE_CATALOG_VERSION,
    total: rows.length,
    configured: rows.filter(r => r.configured).length,
    requiredMissing: rows.filter(r => r.required && !r.configured).map(r => r.name),
    categories: [...new Set(rows.map(r => r.category))].sort(),
    rows,
  };
}
