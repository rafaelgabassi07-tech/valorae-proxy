import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analyzePortfolio } from '../lib/portfolio/analytics.js';
import { extractCustomSelectors } from '../lib/scrape/custom-selectors.js';

const portfolio = await analyzePortfolio({
  positions: [
    { ticker: 'PETR4', quantity: 10, averagePrice: 30, currentPrice: 34, targetPercent: 40, account: 'Nu' },
    { ticker: 'GARE11', quantity: 100, averagePrice: 8.5, currentPrice: 9, targetPercent: 35, account: 'Nu' },
    { ticker: 'CDB', type: 'CDB', currentValue: 5000, investedValue: 4800, annualRatePercent: 11.5, indexer: 'CDI', liquidityDays: 1, maturityDate: '2028-05-26', issuer: 'Banco Teste', targetPercent: 20 },
    { ticker: 'CAIXA', type: 'CASH', currentValue: 1000, targetPercent: 5, liquidityDays: 0 }
  ],
  cashAvailable: 700,
  monthlyContribution: 500,
  projectionYears: 12,
  expectedReturnAnnualPercent: 9,
  inflationAnnualPercent: 4,
}, { enrich: false, view: 'full' });

assert.equal(portfolio.status, 'OK');
assert.equal(portfolio.schemaVersion, 'portfolio-2026-05-26-v21.5.13-quality-matrix');
assert.ok(portfolio.positions.some(p => p.type === 'RENDA_FIXA' && p.annualRatePercent === 11.5));
assert.ok(portfolio.allocation.byType.some(x => x.key === 'RENDA_FIXA'));
assert.ok(portfolio.intelligence?.incomeCalendar?.rows?.length >= 12);
assert.ok(portfolio.intelligence?.goalProjection?.nominalFinalValue > portfolio.summary.totalCurrentValue);
assert.ok(portfolio.intelligence?.liquidity?.some(x => x.key === 'D+0/D+1'));
assert.ok(portfolio.intelligence?.taxPlanner?.hints?.length > 0);
assert.ok(portfolio.intelligence?.technologyReadiness?.capabilities?.includes('portfolio-intelligence'));

const html = '<table><tbody><tr><td>PETR4</td><td>R$ 34,50</td><td>+1,20%</td></tr></tbody></table><a data-url="/comparador">Comparar</a>';
const selected = extractCustomSelectors(html, {
  row: { selector: 'table tbody tr', extract: 'cells' },
  price: { selector: 'td', extract: 'number', limit: 3 },
  compare: { selector: 'a[data-url]', extract: 'data-url' }
});
assert.deepEqual(selected.results.row[0], ['PETR4', 'R$ 34,50', '+1,20%']);
assert.ok(selected.results.price.includes(34.5));
assert.equal(selected.results.compare[0], '/comparador');

const compat = fs.readFileSync('routes/compat/scraper4.js', 'utf8');
assert.ok(compat.includes('payload.fiiList'));
assert.ok(compat.includes('dividendHistoryFromAsset'));
assert.ok(compat.includes("mode === 'historico_12m'"));

console.log('v21.5.13 portfolio tech supremacy tests OK.');
