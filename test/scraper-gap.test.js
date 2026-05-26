import assert from 'node:assert/strict';
import { normalizeB3Range, isB3TradingDay, calculateEasterDateKey, getB3MarketSession } from '../lib/market/b3-calendar.js';
import { parseInvestidor10RankingsHtml } from '../lib/market/rankings-i10.js';
import { normalizePortfolioPositions } from '../lib/portfolio/history.js';

assert.equal(normalizeB3Range('1A'), '1Y');
assert.equal(normalizeB3Range('5A'), '5Y');
assert.equal(normalizeB3Range('Tudo'), 'MAX');
assert.equal(calculateEasterDateKey(2026), '2026-04-05');
assert.equal(isB3TradingDay('2026-01-01'), false);
assert.equal(isB3TradingDay('2026-01-02'), true);
assert.ok(['open','closed','pre-market','after-hours'].includes(getB3MarketSession().status));

const html = `
<section class="maioresAltas"><a href="/acoes/petr4/">PETR4 Petrobras</a><span>R$ 43,40</span><span>+2,31%</span><a href="/acoes/vale3/">VALE3 Vale</a><span>+1,10%</span></section>
<section class="maioresBaixas"><a href="/acoes/wege3/">WEGE3 WEG</a><span>R$ 36,10</span><span>-3,22%</span></section>`;
const rankings = parseInvestidor10RankingsHtml(html);
assert.equal(rankings.altas[0].ticker, 'PETR4');
assert.equal(rankings.baixas[0].ticker, 'WEGE3');

const positions = normalizePortfolioPositions({ tickers: 'PETR4,GARE11', quantities: '100,200', avgPrices: '32,8.50' });
assert.equal(positions.length, 2);
assert.equal(positions[1].ticker, 'GARE11');
assert.equal(positions[1].quantity, 200);
assert.equal(positions[1].averagePrice, 8.5);

console.log('Scraper gap tests OK: calendário B3, rankings e histórico de carteira passaram.');
