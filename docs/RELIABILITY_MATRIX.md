# Reliability Matrix — Valorae Proxy

| Área | Proteção atual | Observação |
|---|---|---|
| Vercel Free | 2 Functions físicas | `api/index.js` e `api/[...path].js` |
| Dependências | Zero obrigatórias | Sem install complexo |
| Cache | Memória/LRU/in-flight | Pode zerar em cold start |
| Scraping | Domínios permitidos | Investidor10, StatusInvest, Yahoo, Google News |
| Drift de fonte | `sourceDrift` e `parserResilience` | Não impede mudança externa, mas sinaliza |
| Batch | Deduplicação e concorrência limitada | Reduz custo e latência |
| Payload | `fields`, `dataFields`, `lean`, `maxItems` | Controla peso para Web/APK |
| Carteira | Ranking, narrativa, metas e renda | Dados dependem do input e fontes públicas |
| API Contract | `/api/openapi`, `/api/fields`, `/api/errors` | Contrato navegável |
| Readiness | `/api/v1/ready` | Sem chamadas externas |
| Observabilidade | `/api/v1/cache/stats`, `sourceReport`, `quality` | Sem banco externo |

## Níveis de confiança sugeridos

- `quality.score >= 80`: exibir normalmente.
- `quality.score 60-79`: exibir com aviso leve.
- `quality.score < 60`: exibir alerta de dados parciais.
- `sourceDrift.sourceDrift === true`: exibir aviso de fonte possivelmente alterada.
- `fieldConfidence.<campo>.confidence < 0.7`: evitar usar como base decisiva.
