import { NexusEngineUltra, canonicalizeTicker, validarTicker } from '../lib/nexus-engine.js';
import { configureEngineForRequest, numberEnv, sendMethodNotAllowed, setCors } from '../lib/vercel-runtime.js';

export default async function handler(req, res) {
  setCors(res, 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  configureEngineForRequest(NexusEngineUltra, req);
  if (req.method !== 'GET' && req.method !== 'POST') {
    return sendMethodNotAllowed(res, 'GET, POST, OPTIONS');
  }

  const input = req.method === 'GET' ? req.query : (req.body || {});
  const ticker = input.ticker;
  if (!ticker || typeof ticker !== 'string') {
    return res.status(400).json({ error: 'Envie o ticker: GET /api/news?ticker=PETR4 ou POST {"ticker":"PETR4"}' });
  }

  const clean = canonicalizeTicker(ticker);
  const erro = validarTicker(clean);
  if (erro) return res.status(400).json({ error: erro });

  const context = {
    nome: input.nome || input.name,
    razaoSocial: input.razaoSocial || input.companyName,
    type: input.type,
  };
  const limit = Math.max(1, Math.min(Number(input.limit || numberEnv('NEXUS_NEWS_LIMIT', 8, { min: 1, max: 20 })), 20));

  try {
    const news = await NexusEngineUltra.fetchNews(clean, context);
    return res.status(200).json({ ticker: clean, count: Math.min(news.length, limit), news: news.slice(0, limit) });
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao buscar notícias: ' + (error?.message || String(error)) });
  }
}
