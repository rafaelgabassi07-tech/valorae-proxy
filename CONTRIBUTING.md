# Contributing — Valorae Proxy

Antes de enviar mudanças:

```bash
npm run verify
npm run build
```

Regras do projeto:

1. Preserve `lib/Valorae-engine.js` como núcleo central.
2. Não adicione dependências obrigatórias, banco, Redis/KV, storage, cron pago, WebSocket ou worker permanente.
3. Use módulos auxiliares pequenos em `lib/*` ou `routes/*` quando necessário.
4. Atualize docs, OpenAPI, campos/erros e testes quando mudar contrato público.
5. Prefira fixtures locais para testar fontes externas.
