# Valorae Proxy v21.5.1 — Audit Hardening Free

Auditoria aplicada sobre a v21.5 Professional Refinement, preservando o núcleo `api/lib/Valorae-engine.js` e mantendo a política free-only para GitHub/Vercel.

## Achados principais

1. A build v21.5 estava funcional nos testes, mas faltavam os endpoints públicos de catálogo `/api/fields` e `/api/errors`, úteis para integração Web/APK e suporte.
2. O inspector visual citado no refinamento não estava presente no pacote final.
3. A montagem automática de base URL confiava demais em `Host`/`X-Forwarded-Host`; isso foi endurecido para evitar caracteres inválidos/injeção em ambientes proxy.
4. O relatório de cache ainda reconhecia Redis/KV por variáveis de ambiente, o que poderia poluir a proposta free-only; agora a build reporta `memory` e ignora cache externo.
5. OpenAPI, health, index e headers estáticos precisavam refletir os novos catálogos e o inspector.

## Melhorias aplicadas

- Novo `/api/fields` com campos estáveis, `normalized.*`, shape `FinancialField` e controles `fields`, `dataFields`, `lean`, `maxItems`, `view` e `profile`.
- Novo `/api/errors` com códigos, HTTP esperado, retryability e headers de diagnóstico.
- Novo `/inspector.html` estático com testes públicos GET/POST, ETag, payload, schema, catálogos e exportação JSON.
- Hardening de `getBaseUrl()` para sanitizar `x-forwarded-proto`, `x-forwarded-host` e `host`.
- `cacheDriverInfo()` passa a reforçar `memory` como único driver ativo nesta build free-only.
- `vercel.json` recebeu headers estáticos adicionais: `X-Content-Type-Options`, `Referrer-Policy` e `Permissions-Policy`.
- `README.md`, `/api/health`, `/api/openapi`, `/api/index` e `public/index.html` atualizados.
- Novo teste `test/v21-5-1-audit-hardening.test.js` cobrindo catálogos, host hardening, cache free-only e bloqueio de scrapeUrl externo.

## Validação executada

```bash
npm run check
npm test
npm run build
```

Resultado: todos os testes passaram.

## Política free-only

Sem Redis, Vercel KV, banco obrigatório, storage externo, cron pago, WebSocket, worker permanente ou dependência paga.
