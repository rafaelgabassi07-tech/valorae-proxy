import { ValoraeEngine } from '../lib/Valorae-engine.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ALLOW_ORIGIN || '*');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    ok: true,
    name: 'Valorae Proxy',
    version: ValoraeEngine.version,
    runtime: 'vercel-node',
    time: new Date().toISOString(),
    endpoints: ['/api/asset?ticker=PETR4&mode=super&includeNews=1', '/api/assets?tickers=PETR4,GARE11', '/api/scrape?url=https://investidor10.com.br/acoes/petr4/', '/api/news?ticker=PETR4', '/api/batch-scrape'],
  });
}
