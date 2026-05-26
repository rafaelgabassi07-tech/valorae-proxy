# MIGRATION_GUIDE

## v21.4/v21.5 para v21.5.13

As URLs públicas continuam válidas. Internamente, o projeto usa apenas duas Functions físicas no Vercel:

- `/api` → `api/index.js`
- `/api/*` → `api/[...path].js`

Handlers que antes ficavam em `api/*.js` agora ficam em `routes/`. Código compartilhado fica em `lib/`.

## Prefixos

- `/api/v1/asset?ticker=PETR4` mantém payload direto.
- `/api/v2/asset?ticker=PETR4` ativa envelope v2.
- Aliases legados como `/api/ativo`, `/api/ativos`, `/api/ranking`, `/api/carteira` continuam roteados internamente.

## Views e profiles

A partir da v21.5.13, os aliases documentados passam a funcionar de verdade:

```text
view=quote|card|wallet|detail|analysis
profile=quote|card|wallet|analysis
```

Eles são mapeados para os modos internos `compact|standard|full` e `fast|standard|deep|portfolio`.

## `/api/sync`

A URL legada `/api/sync` foi mantida, mas retorna `410` com `SYNC_DISABLED_FREE_ONLY`. A build free-only não usa banco/storage externo.
