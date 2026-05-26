import { NexusEngineUltra, inferAssetType, canonicalizeTicker, validarTicker } from '../lib/nexus-engine.js';
import { configureEngineForRequest, sendMethodNotAllowed, setCors, truthy } from '../lib/vercel-runtime.js';

export default async function handler(req, res) {
  setCors(res, 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return sendMethodNotAllowed(res, 'GET, POST, OPTIONS');
  }

  configureEngineForRequest(NexusEngineUltra, req);

  const input = req.method === 'GET' ? req.query : (req.body || {});
  const ticker = input.ticker;
  if (!ticker || typeof ticker !== 'string') {
    return res.status(400).json({ error: 'Envie o ticker: GET ?ticker=PETR4 ou POST {"ticker":"PETR4"}' });
  }

  const clean = canonicalizeTicker(ticker);
  const erro = validarTicker(clean);
  if (erro) {
    return res.status(400).json({
      error: erro,
      hint: 'Índices (^IFIX, ^BVSP) não são suportados neste endpoint. Use tickers de ativos: PETR4, VISC11, BOVA11.',
    });
  }

  const type = input.type ? String(input.type).toUpperCase() : inferAssetType(clean);
  const mode = String(input.mode || '').toLowerCase();
  const includeNews = truthy(input.includeNews) || truthy(input.news) || mode === 'full' || mode === 'super';
  const includeHistory = truthy(input.includeHistory) || truthy(input.history) || mode === 'full' || mode === 'super';
  const range = String(input.range || '5y');
  const interval = String(input.interval || '1d');

  try {
    const result = await NexusEngineUltra.fetchAtivo(clean, type, includeNews);

    if (includeHistory) {
      const [historicoPreco, dividendosYahoo] = await Promise.allSettled([
        NexusEngineUltra.fetchHistoricoGrafico(clean, range, interval),
        NexusEngineUltra.fetchDividends(clean),
      ]);
      result.history = {
        range,
        interval,
        prices: historicoPreco.status === 'fulfilled' ? historicoPreco.value : [],
        dividendsYahoo: dividendosYahoo.status === 'fulfilled' ? dividendosYahoo.value : [],
      };
    }

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao processar ativo: ' + (error?.message || String(error)) });
  }
}
