import { NexusEngineUltra, inferAssetType, canonicalizeTicker, validarTicker } from './lib/nexus-engine.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { ticker } = req.query;
  if (!ticker) {
    return res.status(400).json({ error: 'Envie o ticker via query: ?ticker=PETR4' });
  }

  // Normaliza (.SA, espaços, uppercase) e valida antes de qualquer fetch
  // Sem isso, tickers inválidos como ^IFIX causam TypeError no fetch → 500
  const clean = canonicalizeTicker(ticker);
  const erro  = validarTicker(clean);
  if (erro) {
    return res.status(400).json({
      error: erro,
      hint: 'Índices (^IFIX, ^BVSP) não são suportados. Use tickers de ativos: PETR4, VISC11, BOVA11',
    });
  }

  try {
    const type   = inferAssetType(clean);
    const result = await NexusEngineUltra.fetchAtivo(clean, type);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao processar ativo: ' + error.message });
  }
}
