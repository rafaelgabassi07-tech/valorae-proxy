// Endpoint legado mantido apenas para compatibilidade de URL.
// A v21.5.13 remove qualquer ponte para banco/storage externo para preservar o modo free-only puro.

import { sendJson } from '../lib/performance/http.js';
import { beginRoute } from '../lib/http/route.js';
import { ValoraeEngine } from '../lib/Valorae-engine.js';

export default async function handler(req, res) {
  const route = beginRoute(req, res, {
    version: ValoraeEngine.version,
    methods: ['GET', 'POST'],
    route: 'sync',
    rateMax: Number(process.env.VALORAE_RATE_LIMIT_SYNC_MAX || 30),
    profile: 'sync-disabled',
    cacheControl: 'private, max-age=60',
  });
  if (route.done) return;

  return sendJson(req, res, {
    version: ValoraeEngine.version,
    requestId: route.requestId,
    ok: false,
    status: 'DISABLED',
    code: 'SYNC_DISABLED_FREE_ONLY',
    route: '/api/sync',
    message: 'A rota /api/sync foi preservada como alias legado, mas integrações com banco/storage externo foram removidas nesta build free-only.',
    alternatives: [
      'Use /api/portfolio/analyze para análise sob demanda sem persistência.',
      'Use o armazenamento local do app cliente caso precise salvar preferências do usuário.',
    ],
  }, { status: 410, engineVersion: ValoraeEngine.version, profile: 'sync-disabled', cacheControl: 'private, max-age=60' });
}
