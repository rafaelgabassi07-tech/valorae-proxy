# Valorae Proxy v20.8 — Scraper Supremacy Audit

Esta versão foca nas fraquezas restantes do Valorae quando comparado ao `Scraper (4).js`, sem quebrar o princípio central do projeto: funcionar como Proxy no GitHub/Vercel, sem banco, Redis, KV, worker permanente ou filesystem persistente obrigatório.

## Pontos corrigidos

1. **Seletores customizados em `/api/scrape` e `/api/batch-scrape`**

O Scraper tinha vantagem por aceitar multi-selectors no AeroScrape. O Valorae agora aceita um subconjunto seguro de seletores simples em `selectors`:

```json
{
  "url": "https://investidor10.com.br/acoes/petr4/",
  "selectors": {
    "cards": { "selector": "._card-header, ._card-body" },
    "links": { "selector": "a[href*=\"/acoes/\"]", "extract": "href" },
    "titulo": { "selector": "h1" }
  }
}
```

Suporte atual: `.classe`, `#id`, `tag`, `tag.classe`, `tag#id`, `a[href*=...]`, `src/href/attr:*` e texto/html.

2. **Compatibilidade GET/POST com Scraper (4)**

`/api/compat/scraper4` agora aceita GET e POST. Isso facilita chamadas simples do Web/APK e automações:

```text
/api/compat/scraper4?mode=cotacao_historica&ticker=PETR4&range=1A
/api/compat/scraper4?mode=indices
/api/compat/scraper4?mode=ipca&last=24
```

3. **Cache de mercado com in-flight e stale-if-error**

Foi adicionado cache serverless-safe para Yahoo, BCB/IPCA e índices. Isso reduz chamadas duplicadas, melhora latência e evita quebra total em instabilidade temporária de fonte externa.

4. **Correção no extractor local do Investidor10**

Removida chave duplicada `logo` no objeto de selector results.

5. **Auditoria interna explícita**

Adicionado módulo `api/lib/audit/scraper-gap.js` com relatório de correções contra gaps do Scraper.

## Mantido compatível com Vercel

- Sem dependência obrigatória nova.
- Sem Redis/KV obrigatório.
- Sem banco obrigatório.
- Sem escrita persistente no filesystem.
- Sem WebSocket.
- Sem worker permanente.
- Cache continua em memória e limitado.

## Testes adicionados

```text
test/scraper-supremacy.test.js
```

Valida seletores customizados, auditoria de gap, cache de mercado e compatibilidade básica do Yahoo/ranges.
