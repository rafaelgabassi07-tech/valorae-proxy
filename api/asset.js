import { NexusEngineUltra } from './lib/nexus-engine.js';

export default async function handler(req, res) {
  const { ticker } = req.query;
  if (!ticker) return res.status(400).json({ error: 'Ticker é obrigatório' });

  try {
    const result = await NexusEngineUltra.fetchAtivo(ticker);
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    res.status(200).json({ data: result.data, info: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
