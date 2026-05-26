import { ValoraeEngine, canonicalizeTicker, validarTicker } from './lib/Valorae-engine.js';

function cors(req, res) {
  const origin = process.env.CORS_ALLOW_ORIGIN || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900');
}

export default async function handler(req, res) {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Método não permitido. Use GET.' });

  const ticker = canonicalizeTicker(req.query.ticker);
  const validation = validarTicker(ticker);
  if (validation) return res.status(400).json({ version: ValoraeEngine.version, error: validation });

  const aliases = typeof req.query.aliases === 'string' ? req.query.aliases.split(',').map(s => s.trim()).filter(Boolean) : [];
  const news = await ValoraeEngine.fetchNews(ticker, aliases, { limit: Number(req.query.limit || 8) });
  return res.status(200).json({ version: ValoraeEngine.version, ticker, ...news });
}
