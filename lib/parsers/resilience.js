import { inspectSourceDrift } from '../resilience/source-drift.js';

export const PARSER_RESILIENCE_VERSION = '21.5.13-mature-final-release-free';

const GENERIC_TEXT_MARKERS = [
  'Tudo sobre finanças', 'Carteira Investidor 10', 'Comparador de Ações Rastreador',
  'Mais Buscados CDB', 'Tesouro Educa', 'Magic Number', 'Preço Justo de Graham'
];

export function inspectParserResilience(payload = {}) {
  const results = payload.results || {};
  const warnings = [];
  const suspectFields = [];
  const missingCritical = [];
  const type = payload.type;
  const required = type === 'FII'
    ? ['informacoesFundo','dividendos','historicoIndicadores','valorPatrimonial']
    : ['indicadores','dividendos','dadosEmpresa','informacoesEmpresa'];
  for (const key of required) if (!results[key]) missingCritical.push(key);
  for (const [key, value] of Object.entries(results)) {
    if (typeof value !== 'string') continue;
    const hit = GENERIC_TEXT_MARKERS.find(m => value.includes(m));
    if (hit) suspectFields.push({ field: key, reason: `Texto genérico detectado: ${hit}` });
  }
  if (results.logoUrl && /assets\/front\/images\/logo\.webp/.test(String(results.logoUrl))) {
    suspectFields.push({ field: 'logoUrl', reason: 'Logo genérico do Investidor10' });
  }
  if (missingCritical.length) warnings.push(`Campos críticos ausentes: ${missingCritical.join(', ')}`);
  if (suspectFields.length) warnings.push(`${suspectFields.length} campo(s) suspeito(s) detectados pelo parser resilience.`);
  const sourceDrift = inspectSourceDrift({ provider: 'asset-parser', results, requiredKeys: required, warnings, minCoverage: 0.5 });
  const score = Math.max(0, 100 - missingCritical.length * 12 - suspectFields.length * 8 - (sourceDrift.sourceDrift ? 10 : 0));
  return {
    version: PARSER_RESILIENCE_VERSION,
    score,
    missingCritical,
    suspectFields,
    sourceDrift,
    warnings,
    recommendation: warnings.length ? 'usar fallback/campo alternativo, reduzir confidence ou retornar PARTIAL' : 'parser saudável',
  };
}

export function applyResilienceWarnings(payload = {}) {
  const resilience = inspectParserResilience(payload);
  const warnings = Array.isArray(payload.warnings) ? payload.warnings : [];
  return { ...payload, warnings: [...new Set([...warnings, ...resilience.warnings])], parserResilience: resilience };
}
