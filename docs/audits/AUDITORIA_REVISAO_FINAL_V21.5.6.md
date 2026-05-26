# Valorae v21.5.13 — Revisão Final e Correções Free-only

Esta revisão verificou o pacote v21.5.5 arquivo por arquivo e corrigiu inconsistências que não apareciam nos testes automatizados básicos.

## Correções aplicadas

1. `vercel.json` não define mais CORS para `/api/*`; o CORS da API fica exclusivamente no runtime (`lib/security/guard.js`), evitando conflito entre wildcard `*` e allowlist refletida.
2. `/api/sync` foi preservado como URL legada, mas todo código de ponte para banco/storage externo foi removido. A rota agora responde `DISABLED_FREE_ONLY` e recomenda alternativas sem persistência externa.
3. OpenAPI deixou de carregar texto antigo de auditoria v20.8 e passa a declarar a revisão v21.5.13.
4. Auditoria free-only foi ampliada para bloquear referências a serviços externos complexos no código de runtime.
5. Auditoria de rotas passou a validar que `vercel.json` não injeta CORS amplo nas Functions.

## Resultado

O projeto continua com duas Functions físicas (`api/index.js` e `api/[...path].js`), sem dependências no `package.json`, sem Redis/KV/banco/storage externo obrigatório, sem WebSocket, sem cron pago e sem worker permanente.
