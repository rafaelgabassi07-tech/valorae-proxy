# API Contract — Valorae Proxy v21.5.13

## Envelope v1

Endpoints `/api/*` e `/api/v1/*` retornam o payload direto do recurso.

## Envelope v2

Endpoints `/api/v2/*` ou `?envelope=1` retornam:

```json
{
  "ok": true,
  "schemaVersion": "envelope-v2",
  "version": "21.5.13-mature-final-release-free",
  "requestId": "...",
  "data": {},
  "meta": {
    "apiVersion": "v2",
    "generatedAt": "...",
    "payloadControls": {}
  }
}
```

## Endpoints de contrato e lançamento

- `/api/v1/ready`: readiness sem chamadas externas.
- `/api/v1/manifest`: manifesto de rotas, aliases e capacidades.
- `/api/fields`: catálogo de campos estáveis.
- `/api/errors`: catálogo de erros.
- `/api/openapi`: OpenAPI 3.1.

## Controles de payload

- `fields=a,b.c`: recorta o payload final.
- `dataFields=a,b.c`: recorta `data` quando há envelope.
- `lean=1`: remove campos pesados.
- `maxItems=20`: limita arrays recursivamente.

Caminhos perigosos como `__proto__`, `prototype` e `constructor` são ignorados para evitar prototype pollution.

## Views

Aliases públicos aceitos:

```text
instant -> compact
ultra -> compact
quote -> compact
card -> compact
wallet -> standard
detail -> full
analysis -> full
```

Views internas compatíveis: `compact`, `standard`, `full`.

## Profiles

Aliases públicos aceitos:

```text
instant -> instant
ultra -> instant
quote -> fast
card -> fast
wallet -> portfolio
analysis -> deep
balanced -> standard
complete -> deep
```

Profiles internos compatíveis: `instant`, `fast`, `standard`, `deep`, `portfolio`.

## Erros

Respostas de erro usam shape comum:

```json
{
  "version": "...",
  "requestId": "...",
  "status": "ERROR",
  "code": "INVALID_TICKER",
  "error": "..."
}
```

Consulte `/api/errors` para o catálogo atual.

## Confiabilidade

Campos recomendados para UI Web/APK:

- `quality.score`
- `fieldConfidence`
- `sourceReport`
- `parserResilience`
- `sourceDrift`
- `schemaStability`

Eles indicam se a resposta está completa, parcial ou com possível mudança de fonte.
