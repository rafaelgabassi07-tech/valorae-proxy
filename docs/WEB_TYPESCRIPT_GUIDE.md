# Web TypeScript Guide — Valorae v21.5.13

O SDK TypeScript fica em:

```text
public/sdk/typescript/valorae-client.ts
```

Exemplo:

```ts
import { ValoraeClient } from './valorae-client';

const valorae = new ValoraeClient('https://seu-deploy.vercel.app');
const ready = await valorae.ready();
const manifest = await valorae.manifest();
const asset = await valorae.asset('PETR4', { view: 'quote', profile: 'quote', lean: true });
const portfolio = await valorae.portfolioAnalyze({
  positions: [
    { ticker: 'PETR4', quantity: 10, averagePrice: 32, targetPercent: 40 },
    { ticker: 'GARE11', quantity: 20, averagePrice: 8.5, targetPercent: 30 }
  ],
  monthlyContribution: 500
});
```

## Tipos principais

- `ValoraeAssetPayload`
- `EnvelopeV2<T>`
- `ValoraeFinancialField`
- `PortfolioPosition`
- `PortfolioIntelligence`
- `ValoraeView`
- `ValoraeProfile`

## Observações

O projeto não depende de `typescript` no `package.json`. O script `npm run typecheck` valida o contrato do `.d.ts` e do SDK com Node puro para manter o deploy simples na Vercel gratuita.
