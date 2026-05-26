import assert from 'node:assert/strict';
import fs from 'node:fs';
import { extractCustomSelectors } from '../lib/scrape/custom-selectors.js';
import { inspectSourceDrift } from '../lib/resilience/source-drift.js';
import { analyzePortfolio } from '../lib/portfolio/analytics.js';
import { resolvePerformanceOptions } from '../lib/performance/profile.js';

const html = fs.readFileSync('test/fixtures/source/investidor10-fii-sample.html', 'utf8');
const selectors = {
  price: { selector: '._card-body', extract: 'text', limit: 1 },
  compareUrl: { selector: '#table-compare-fiis', extract: 'data-url' },
  rows: { selector: 'table tbody tr', extract: 'cells' },
  logo: { selector: '.header-company img', extract: 'src' },
};
const extracted = extractCustomSelectors(html, selectors, { provider: 'fixture-investidor10', url: 'fixture://gare11', minCoverage: 0.75 });
assert.equal(extracted.results.compareUrl[0], '/api/fii/comparador/table/123/');
assert.equal(extracted.results.rows.length, 2);
assert.equal(extracted.sourceDrift.sourceDrift, false);

const drift = inspectSourceDrift({ html, selectors, results: { price: [], compareUrl: [] }, requiredKeys: ['price','compareUrl','rows'], minCoverage: 0.8 });
assert.equal(drift.sourceDrift, true);
assert.ok(drift.changedSelectors.includes('rows'));

const instant = resolvePerformanceOptions({ profile: 'instant' });
assert.equal(instant.profile, 'instant');
assert.equal(instant.enableInternalApis, false);
assert.ok(instant.timeoutMs <= 3000);

const portfolio = await analyzePortfolio({
  positions: [
    { ticker: 'PETR4', type: 'ACAO', quantity: 10, averagePrice: 30, currentPrice: 34, targetPercent: 20, objective: 'crescimento', account: 'corretora-a' },
    { ticker: 'GARE11', type: 'FII', quantity: 100, averagePrice: 8, currentPrice: 9, targetPercent: 35, dividendYield: 12, objective: 'renda', account: 'corretora-a' },
    { ticker: 'CASH', type: 'CAIXA', quantity: 1, currentValue: 1000, targetPercent: 20, objective: 'reserva', liquidityDays: 0 }
  ],
  targetsByTicker: { PETR4: 20, GARE11: 35, CASH: 20 },
  monthlyContribution: 500,
  targetMonthlyIncome: 1000,
  targetPortfolioValue: 100000,
  view: 'full'
}, { enrich: false });
assert.equal(portfolio.status, 'OK');
assert.ok(portfolio.allocation.byObjective.length >= 2);
assert.ok(portfolio.intelligence.positionRanking.byScore.length >= 3);
assert.ok(portfolio.intelligence.portfolioNarrative.summary);
assert.ok(portfolio.intelligence.passiveIncomeProjection.rows.length > 0);
assert.ok(portfolio.intelligence.rebalanceRoadmap.suggestedOrder);

console.log('v21.5.13 source reliability and portfolio intelligence tests OK');
