# Environment — Valorae Proxy v21.5.13

Nenhuma variável é obrigatória para o modo free-only. Use `.env.example` como base local.

Principais variáveis:

| Variável | Uso | Padrão |
|---|---|---|
| `VALORAE_PUBLIC_BASE_URL` | URL pública do deploy | inferida por headers |
| `VALORAE_CORS_ALLOW_ORIGINS` | Allowlist CORS CSV | `*` quando strict desligado |
| `VALORAE_CORS_STRICT` | CORS estrito por base/allowlist | `0` |
| `VALORAE_RATE_LIMIT_MAX` | Limite por rota/IP | `90` |
| `VALORAE_RATE_LIMIT_WINDOW_MS` | Janela de rate limit | `60000` |
| `VALORAE_MAX_BODY_BYTES` | Limite de POST | `524288` |
| `VALORAE_MAX_URL_LENGTH` | Limite de URL/query | `4096` |
| `VALORAE_MAX_QUERY_PARAMS` | Limite de query params | `80` |
| `VALORAE_FETCH_TIMEOUT_MS` | Timeout de fontes externas | `12000` |
| `VALORAE_MAX_HTML_CHARS` | Máximo de HTML processado | `3200000` |
| `VALORAE_ADMIN_TOKEN` | Ativa rotas admin | vazio/desativado |
| `VALORAE_ADMIN_ALLOW_QUERY_TOKEN` | Permite token admin via query apenas fora de produção | `0` |
| `VALORAE_ADMIN_ALLOW_QUERY_TOKEN_IN_PRODUCTION` | Override explícito e não recomendado para query token em produção | `0` |

Consulte também `/api/v1/env`, que expõe o catálogo sem revelar valores completos.
