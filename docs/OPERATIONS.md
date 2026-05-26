# Operação — Valorae Proxy

## Health e readiness

- `/api/health`: status de vida do runtime.
- `/api/v1/ready`: validação de prontidão de lançamento sem chamadas externas.
- `/api/v1/manifest`: capacidades, rotas, aliases, política free-only e recursos de carteira.
- `/api/v1/cache/stats`: métricas de cache da instância quente.

## Cache

O cache é apenas em memória. Ele é rápido e gratuito, mas pode zerar quando a função serverless esfriar ou escalar. Isso é esperado.

## Falhas de fonte

Fontes públicas podem bloquear scraping, mudar HTML ou limitar requests. O VALORAE usa:

- `parserResilience`
- `sourceDrift`
- `sourceReport`
- `quality`
- `fieldConfidence`

Esses campos ajudam o app Web/APK a decidir se deve exibir alerta, fallback ou reduzir confiança.

## Segurança operacional

- CORS é aplicado no runtime.
- Rate limit é em memória por rota/IP.
- `scrapeUrl` de cliente é ignorada por padrão.
- `/api/sync` é legado desativado na build free-only.
- Admin só liga com `VALORAE_ADMIN_TOKEN`.

## Plano de rollback

1. Volte para a release ZIP anterior no GitHub.
2. Redeploy na Vercel.
3. Verifique `/api/v1/ready`.
4. Confirme `/api/v1/asset?ticker=PETR4&view=quote&profile=quote`.
