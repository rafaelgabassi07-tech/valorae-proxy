import assert from 'node:assert/strict';
import { buildUniversalNormalized, normalizeDividendHistory } from '../lib/normalizers/universal.js';
import { inspectParserResilience } from '../lib/parsers/resilience.js';
import { buildSchemaStability } from '../lib/contract/stability.js';
import { transformResponsePayload } from '../lib/contract/response.js';
import { compareAssets } from '../lib/market/compare.js';
import { buildPortfolioReturnSeries, buildContributionSimulation } from '../lib/portfolio/returns-advanced.js';
import { ValoraeEngine } from '../lib/Valorae-engine.js';

assert.equal(ValoraeEngine.version, '21.5.13-mature-final-release-free');

const normalized = buildUniversalNormalized({ results: { cotacao: { precoAtual: 'R$ 32,10' }, indicadores: { dividendYield: '8,5%', pvp: '0,92' } } });
assert.equal(normalized.precoAtual.unit, 'BRL');
assert.equal(normalized.dividendYield.unit, '%');
assert.equal(normalized.pvp.unit, 'ratio');
assert.ok(normalized._meta.count >= 3);

const resilience = inspectParserResilience({ type: 'ACAO', results: { nome: 'Tudo sobre finanças' } });
assert.ok(resilience.missingCritical.length >= 1);
assert.ok(resilience.suspectFields.length >= 1);

const stability = buildSchemaStability({ version: 'x', ticker: 'PETR4', type: 'ACAO', results: {}, normalized: {} });
assert.ok(stability.stableKeys.includes('parserResilience'));

const limited = transformResponsePayload({ items: [1,2,3], debug: { rawHtml: 'x' } }, { query: { lean: '1', maxItems: '2' } });
assert.deepEqual(limited.items, [1,2]);
assert.equal(limited.debug, undefined);

const cmp = compareAssets([
  { ticker: 'AAA3', type: 'ACAO', status: 'OK', quality: { score: 90 }, valoraeScore: { value: 80 }, results: { indicadores: { dividendYield: '10%', pvp: '0,8', pl: '6', roe: '15%' } } },
  { ticker: 'BBB11', type: 'FII', status: 'OK', quality: { score: 70 }, valoraeScore: { value: 70 }, results: { indicadores: { dividendYield: '7%', pvp: '1,1' } } },
]);
assert.ok(cmp.profiles.valor.length >= 1);
assert.ok(cmp.profiles.rendaFii.length >= 1);
assert.ok(cmp.explanations[0].decisiveFields.includes('score'));

const series = buildPortfolioReturnSeries({ transactions: [
  { date: '2026-01-10', type: 'BUY', quantity: 10, price: 20 },
  { date: '2026-01-20', type: 'DIVIDEND', amount: 5 },
]});
assert.equal(series.monthly[0].month, '2026-01');
assert.equal(series.monthly[0].netContribution, 200);

const sim = buildContributionSimulation({ positions: [{ ticker: 'PETR4', currentPercent: 10, targetPercent: 20 }, { ticker: 'VALE3', currentPercent: 30, targetPercent: 35 }] }, 1500);
assert.equal(sim.suggestions.length, 2);

const divStats = normalizeDividendHistory({ historico: [{ dataCom: '2026-02-01', valor: 1 }, { dataCom: '2026-01-01', valor: 2 }] });
assert.equal(divStats.total, 3);

console.log('v21.5 professional refinement tests OK.');
