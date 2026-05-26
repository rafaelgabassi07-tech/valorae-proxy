# Troubleshooting — Valorae Proxy

## Deploy falha na Vercel

Rode localmente:

```bash
npm run verify
npm run build
```

O projeto não exige `npm install` de dependências porque `dependencies` é vazio.

## CORS bloqueado

Para API pública/demo, deixe CORS padrão. Para produção restrita:

```bash
VALORAE_CORS_STRICT=1
VALORAE_PUBLIC_BASE_URL=https://seu-proxy.vercel.app
VALORAE_CORS_ALLOW_ORIGINS=https://seu-app.vercel.app
```

## Fonte externa sem dados

Use:

- `/api/v1/source/status`
- `/api/v1/cache/stats`
- `profile=instant` para fallback rápido
- `debug=1` apenas em desenvolvimento

## Payload grande

Use:

```text
?lean=1&view=card&profile=quote&maxItems=20&fields=ticker,normalized,quality
```

## Carteira sem score bom

Informe `quantity`, `averagePrice`, `currentPrice/currentValue`, `targetPercent`, `objective`, `account`, `issuer` e `tags` por posição.
