export const SOURCE_DRIFT_VERSION = '21.5.13-mature-final-release-free';

function safeArray(value) { return Array.isArray(value) ? value : []; }
function safeObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }

export function inspectSourceDrift({ provider = 'unknown', url = '', html = '', results = {}, selectors = {}, warnings = [], requiredKeys = [], minCoverage = 0.55 } = {}) {
  const selectorKeys = Object.keys(safeObject(selectors));
  const resultObj = safeObject(results);
  const keysToCheck = requiredKeys.length ? requiredKeys : selectorKeys;
  const emptyKeys = keysToCheck.filter((key) => {
    const value = resultObj[key];
    if (Array.isArray(value)) return value.length === 0;
    return value === undefined || value === null || value === '';
  });
  const matchedKeys = keysToCheck.filter(k => !emptyKeys.includes(k));
  const htmlLength = String(html || '').length;
  const coverage = keysToCheck.length ? matchedKeys.length / keysToCheck.length : (Object.keys(resultObj).length ? 1 : 0);
  const warningHits = safeArray(warnings).filter(w => /sem resultado|selector|drift|fallback|bloque|captcha|cloudflare|forbidden|timeout/i.test(String(w)));
  const blockedMarkers = /captcha|cloudflare|access denied|forbidden|temporarily unavailable|robot|verifique se voc/i.test(String(html || ''));
  const sourceDrift = Boolean(
    (keysToCheck.length >= 3 && coverage < minCoverage) ||
    (htmlLength > 500 && selectorKeys.length && Object.keys(resultObj).length === 0) ||
    warningHits.length >= 2 ||
    blockedMarkers
  );
  const severity = blockedMarkers ? 'blocked' : sourceDrift && coverage < 0.25 ? 'high' : sourceDrift ? 'medium' : 'low';
  return {
    version: SOURCE_DRIFT_VERSION,
    provider,
    url,
    sourceDrift,
    severity,
    selectorCoverage: Math.round(coverage * 10000) / 100,
    expectedSelectors: keysToCheck.length,
    matchedSelectors: matchedKeys.length,
    emptySelectors: emptyKeys,
    changedSelectors: emptyKeys.slice(0, 20),
    htmlLength,
    warningCount: safeArray(warnings).length,
    warnings: warningHits.slice(0, 10),
    blockedMarkers,
    recommendation: sourceDrift
      ? 'Revisar seletores/fonte, acionar fallback e reduzir confiança dos campos afetados.'
      : 'Fonte aparentemente estável no recorte analisado.',
  };
}

export function mergeSourceDriftReports(reports = []) {
  const list = safeArray(reports).filter(Boolean);
  const sourceDrift = list.some(r => r.sourceDrift);
  const high = list.filter(r => ['high','blocked'].includes(r.severity)).length;
  const totalExpected = list.reduce((s, r) => s + Number(r.expectedSelectors || 0), 0);
  const totalMatched = list.reduce((s, r) => s + Number(r.matchedSelectors || 0), 0);
  return {
    version: SOURCE_DRIFT_VERSION,
    sourceDrift,
    severity: high ? 'high' : sourceDrift ? 'medium' : 'low',
    reports: list,
    aggregateCoverage: totalExpected ? Math.round((totalMatched / totalExpected) * 10000) / 100 : 100,
  };
}
