export const SCRAPER_GAP_AUDIT_VERSION = '21.5.13-mature-final-release-free';

export function scraperGapAuditReport() {
  return {
    version: SCRAPER_GAP_AUDIT_VERSION,
    focus: 'Fraquezas remanescentes do Valorae frente ao Scraper (4).js',
    corrections: [
      'GET e POST no modo /api/compat/scraper4 para facilitar Web/APK e automações simples.',
      'Extração de seletores customizados em /api/scrape e /api/batch-scrape, aproximando o comportamento multi-selector do Scraper.',
      'Cache/in-flight/stale-if-error nos módulos Yahoo, BCB/IPCA e índices, reduzindo chamadas repetidas e quedas por instabilidade externa.',
      'Correção de chave duplicada logo no extractor local do Investidor10.',
      'OpenAPI/health/documentação com capacidades de auditoria e compatibilidade explícitas.'
    ],
    stillServerlessSafe: true,
    requiresExternalDatabase: false,
    requiresRedisOrKV: false,
  };
}
