# Valorae v20.4 — Performance Boost Engine

Esta versão foca em velocidade, redução de payload e menor custo em Vercel sem remover a riqueza do Valorae.

## Perfis

| Perfil | Uso ideal | Estratégia |
|---|---|---|
| `fast` | cards, busca, tela inicial | seletor-only, menos HTML, sem APIs internas por padrão |
| `standard` | tela principal do ativo | equilíbrio entre dados e latência |
| `deep` | auditoria, debug, tela muito detalhada | HTML completo, APIs internas e parsing amplo |
| `portfolio` | carteira e batch | payload compacto, maior concorrência e cache mais longo |

## Cache

A v20.4 mantém cache em memória com:

- LRU por quantidade e bytes;
- chave versionada;
- diferenciação por perfil/view;
- `stale-if-error` para manter resposta utilizável se a fonte falhar;
- deduplicação de chamadas em andamento.

## HTTP

Endpoints principais usam:

- `ETag`;
- suporte a `If-None-Match` e retorno `304`;
- `X-Valorae-Response-Bytes`;
- `X-Valorae-Performance`;
- `X-Valorae-Cache-Policy`.

## Recomendações para o app

### Lista de carteira

```text
/api/assets?tickers=PETR4,GARE11&view=compact&profile=portfolio
```

### Card de ativo

```text
/api/asset?ticker=PETR4&view=compact&profile=fast
```

### Tela detalhada

```text
/api/asset?ticker=PETR4&view=full&profile=standard&includeNews=1
```

### Diagnóstico completo

```text
/api/asset?ticker=PETR4&view=full&profile=deep&debug=1&nocache=1
```
