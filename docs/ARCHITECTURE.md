# Architecture — Valorae Proxy v21.5.13

```text
api/index.js + api/[...path].js
        │
        ▼
routes/_router.js  ── aliases v1/v2/legados
        │
        ├─ routes/asset.js / assets / compare / market
        ├─ routes/portfolio/*
        ├─ routes/scrape / batch-scrape / compat/scraper4
        └─ routes/system: ready, manifest, env, schema, source/status
        │
        ▼
lib/Valorae-engine.js  ← núcleo central preservado
        │
        ├─ lib/market/*
        ├─ lib/portfolio/*
        ├─ lib/quality/*
        ├─ lib/resilience/*
        ├─ lib/scrape/*
        ├─ lib/security/*
        └─ lib/catalogs/*
```

O projeto evita dependências externas obrigatórias. Cache é em memória, adequado a instâncias serverless quentes, e pode resetar quando a Function esfriar.
