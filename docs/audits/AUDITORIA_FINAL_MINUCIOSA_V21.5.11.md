# Valorae v21.5.13 — Auditoria Final Minuciosa Free

Esta revisão foi feita sobre a v21.5.10 com foco em bugs pequenos que poderiam passar em auditorias estruturais, mas aparecer em uso HTTP real.

## Correções aplicadas

1. `HEAD` agora é tratado como método de leitura no helper de rotas. Antes, rotas `GET` aceitavam `HEAD`, mas `getInput()` lia `req.body` em vez de `req.query`, podendo causar erro 400 em URLs como `/api/v1/asset?ticker=PETR4`.
2. A normalização do router agora remove apenas `/api` ou `/api/`, sem truncar caminhos parecidos como `/apiary`.
3. Adicionado `audit:minutiae`, que valida imports locais, handlers default das rotas, contrato HEAD/query, normalização de path, versão pública e guardrails free-only.
4. Adicionado teste comportamental para `HEAD /api/v1/asset` e para path `/apiary/ready`.

## Política preservada

- 2 Functions físicas: `api/index.js` e `api/[...path].js`.
- Sem dependencies/devDependencies obrigatórias.
- Sem Redis, KV, banco, storage externo, cron pago, WebSocket ou worker permanente.
- `lib/Valorae-engine.js` continua como núcleo central.

## Validação

Use `npm run verify` antes do deploy. A verificação inclui sintaxe, testes, typecheck free, auditorias de Functions, free-only, versão, rotas, lançamento, auditoria minuciosa e smoke. Use `npm run build` para simular o build Vercel.
