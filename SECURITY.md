# Security Policy — Valorae Proxy

O VALORAE é mantido como proxy HTTP/JSON serverless e free-only. Não abra issues públicas com segredos, tokens, URLs privadas ou dados sensíveis.

## Reporte seguro

1. Descreva o problema sem incluir credenciais.
2. Informe rota, payload mínimo e comportamento esperado.
3. Remova tokens, IPs privados e dados pessoais.

## Escopo de segurança

- Sem banco, Redis, KV, storage externo, cron pago, WebSocket ou worker permanente.
- URLs de scrape são restritas a hosts permitidos.
- Erros em produção são sanitizados por padrão.
- Admin fica desativado sem `VALORAE_ADMIN_TOKEN`.
