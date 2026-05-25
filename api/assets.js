import { NexusEngineUltra, inferAssetType, canonicalizeTicker, validarTicker } from './lib/nexus-engine.js';

// Limite de tickers por requisição — protege contra abuso e timeout do Vercel
const MAX_TICKERS = 20;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Aceita tickers via GET ?tickers=PETR4,VISC11,BOVA11
  // ou via POST { "tickers": ["PETR4", "VISC11", "BOVA11"] }
  let rawTickers = [];

  if (req.method === 'GET') {
    const param = req.query.tickers || req.query.ticker || '';
    rawTickers = param.split(',').map(t => t.trim()).filter(Boolean);
  } else if (req.method === 'POST') {
    const body = req.body;
    if (Array.isArray(body?.tickers)) {
      rawTickers = body.tickers;
    } else if (typeof body?.tickers === 'string') {
      rawTickers = body.tickers.split(',').map(t => t.trim()).filter(Boolean);
    }
  } else {
    return res.status(405).json({ error: 'Método não permitido. Use GET ou POST.' });
  }

  if (rawTickers.length === 0) {
    return res.status(400).json({
      error: 'Envie ao menos um ticker.',
      hint: 'GET /api/assets?tickers=PETR4,VISC11  ou  POST { "tickers": ["PETR4","VISC11"] }',
    });
  }

  if (rawTickers.length > MAX_TICKERS) {
    return res.status(400).json({
      error: `Máximo de ${MAX_TICKERS} tickers por requisição. Enviados: ${rawTickers.length}.`,
    });
  }

  // Valida e normaliza todos os tickers antes de qualquer fetch
  const valid   = [];
  const invalid = [];

  for (const raw of rawTickers) {
    const clean = canonicalizeTicker(raw);
    const erro  = validarTicker(clean);
    if (erro) {
      invalid.push({ ticker: raw, error: erro });
    } else {
      valid.push(clean);
    }
  }

  // Busca todos os tickers válidos em paralelo
  const results = await Promise.allSettled(
    valid.map(async (ticker) => {
      const type   = inferAssetType(ticker);
      const result = await NexusEngineUltra.fetchAtivo(ticker, type);
      return result;
    })
  );

  // Monta resposta separando sucesso de falha
  const assets  = [];
  const errors  = [...invalid];

  results.forEach((outcome, i) => {
    if (outcome.status === 'fulfilled') {
      assets.push(outcome.value);
    } else {
      errors.push({ ticker: valid[i], error: outcome.reason?.message || 'Erro desconhecido' });
    }
  });

  return res.status(200).json({
    count:   assets.length,
    assets,
    errors:  errors.length > 0 ? errors : undefined,
  });
}


