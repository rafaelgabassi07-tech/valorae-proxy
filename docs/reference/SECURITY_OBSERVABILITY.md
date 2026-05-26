# Valorae v20.8 — Audit & Reliability

Esta versão reforça o Valorae para uso em produção, site web TypeScript e APK Android Java.

## Melhorias principais

- Fast path corrigido: `profile=fast` e `profile=portfolio` agora conseguem usar resposta por seletores sem baixar HTML pesado quando `returnHtml=false`.
- Rate limit em memória para endpoints principais e administrativos.
- Headers de segurança: `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Request-Id` e `X-Valorae-Security`.
- Limite de payload para proteger POSTs grandes em carteira/batch.
- Erros sanitizados por padrão, com `VALORAE_VERBOSE_ERRORS=1` para desenvolvimento.
- Endpoints administrativos protegidos por token.
- Limpeza controlada de caches em runtime.
- Self-test interno sem rede para validar funções essenciais do motor.

## Endpoints administrativos

Defina uma variável de ambiente:

```bash
VALORAE_ADMIN_TOKEN="um-token-forte"
```

Depois use:

```bash
curl -H "Authorization: Bearer $VALORAE_ADMIN_TOKEN" \
  https://valorae-proxy.vercel.app/api/admin/status
```

```bash
curl -X POST -H "Authorization: Bearer $VALORAE_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"scope":"asset"}' \
  https://valorae-proxy.vercel.app/api/admin/cache
```

Escopos aceitos para cache:

- `all`
- `asset`
- `html`
- `scrape`
- `news`

## Rate limit

Variáveis opcionais:

```bash
VALORAE_RATE_LIMIT_WINDOW_MS=60000
VALORAE_RATE_LIMIT_MAX=90
VALORAE_RATE_LIMIT_ASSET_MAX=120
VALORAE_RATE_LIMIT_ASSETS_MAX=80
VALORAE_ADMIN_RATE_LIMIT_MAX=20
VALORAE_RATE_LIMIT_DISABLED=0
```

## Fast path real

Por padrão, o perfil rápido evita fallback direto com HTML completo quando estiver em modo selector-only. Para permitir fallback direto mesmo em fast:

```bash
VALORAE_FAST_DIRECT_FALLBACK=1
```

## Payload limit

```bash
VALORAE_MAX_BODY_BYTES=524288
```

## Observabilidade

Todo JSON principal passa a poder carregar ou expor:

- `X-Request-Id`
- `X-Valorae-Security`
- `X-RateLimit-*`
- `X-Valorae-Performance`
- `X-Valorae-Engine-Version`
- `/api/admin/status` com runtime, caches, segurança e self-test
