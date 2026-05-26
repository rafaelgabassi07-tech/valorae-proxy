import { ValoraeEngine } from '../lib/Valorae-engine.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ALLOW_ORIGIN || '*');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    name: 'Valorae Proxy API',
    version: ValoraeEngine.version,
    status: 'online',
    examples: {
      asset: '/api/asset?ticker=PETR4&mode=super&includeNews=1',
      assets: '/api/assets?tickers=PETR4,GARE11,VISC11&mode=super',
      scrape: '/api/scrape?url=https://investidor10.com.br/acoes/petr4/',
      news: '/api/news?ticker=PETR4',
      batchScrape: '/api/batch-scrape',
      health: '/api/health',
    },
  });
}
