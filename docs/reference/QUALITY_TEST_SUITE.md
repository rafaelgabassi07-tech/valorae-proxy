# Quality & Test Suite v20.2

A v20.1 adiciona uma suíte mínima para evitar regressões nos dois ativos-base do projeto: `PETR4` e `GARE11`.

## Comandos

```bash
npm run check
npm test
npm run build
```

## Golden tests

Os fixtures ficam em:

```text
test/fixtures/GARE11_golden.json
test/fixtures/PETR4_golden.json
```

O teste valida:

- Schema essencial por tipo de ativo.
- DY real de FII, evitando valor de checklist.
- Número de cotistas do FII.
- Estatísticas derivadas de imóveis.
- Margem líquida e sinais corretos de indicadores de ação.
- Resumo financeiro derivado da empresa.

## Como evoluir

Ao encontrar novo erro em produção:

1. Salve o JSON problemático em `test/fixtures`.
2. Crie uma expectativa no `test/golden.test.js`.
3. Corrija o parser/normalizador.
4. Rode `npm test` antes de subir.


## v20.2 checks

A suíte agora também valida `fieldConfidence` e `valoraeScore` nos golden tests.
