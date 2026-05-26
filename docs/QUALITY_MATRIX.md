# Quality Matrix — Valorae v21.5.13

A v21.5.13 implementa somente melhorias recomendadas e viáveis:

- maturidade de lançamento: `.nvmrc`, licença, security, contributing, env docs e troubleshooting;
- fonte/confiabilidade: fixtures adicionais, `/api/v1/source/status` e matriz de providers;
- performance/cache: headers de schema/source/cache, TTL matrix e rota de cache mantida;
- carteira: `healthScore`, `incomeStabilityScore`, `dividendCoverage`, ranking e narrativa;
- API/contrato: `/api/v1/schema`, `/api/v1/env`, OpenAPI com `operationId`;
- segurança: CORS strict opcional, limites de URL/query e proteção contra rate-limit desligado acidentalmente em produção;
- testes/auditorias: auditoria v21.5.13 para contrato, segurança e melhorias recomendadas.

Ficaram fora: Redis/KV, bancos, storage, cron pago, WebSocket, worker permanente, frameworks pesados e renda fixa avançada.
