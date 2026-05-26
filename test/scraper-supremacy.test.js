import assert from 'node:assert/strict';
import { extractCustomSelectors, parseSelectorsInput } from '../lib/scrape/custom-selectors.js';
import { scraperGapAuditReport } from '../lib/audit/scraper-gap.js';
import { marketCacheStats } from '../lib/market/cache.js';
import { yahooSymbol, RANGE_MAP } from '../lib/market/yahoo.js';

const html = `
<html><body>
  <section id="main"><h1>PETR4</h1><a href="/acoes/petr4/">PETR4 Petrobrás</a></section>
  <div class="price">R$ 43,40</div>
  <img class="logo" src="/logos/petr4.png" />
</body></html>`;

const selectors = {
  title: { selector: 'h1' },
  price: { selector: '.price' },
  link: { selector: 'a[href*="/acoes/"]', extract: 'href' },
};
const extracted = extractCustomSelectors(html, selectors);
assert.equal(extracted.results.title[0], 'PETR4');
assert.equal(extracted.results.price[0], 'R$ 43,40');
assert.equal(extracted.results.link[0], '/acoes/petr4/');
assert.deepEqual(parseSelectorsInput(JSON.stringify(selectors)).title.selector, 'h1');

const audit = scraperGapAuditReport();
assert.equal(audit.stillServerlessSafe, true);
assert.equal(audit.requiresRedisOrKV, false);
assert.ok(audit.corrections.length >= 4);

assert.equal(yahooSymbol('PETR4'), 'PETR4.SA');
assert.ok(RANGE_MAP['1Y']);
assert.ok(marketCacheStats().version.includes('21.5.'));

console.log('Scraper supremacy audit tests OK: seletores customizados, cache de mercado e auditoria passaram.');
