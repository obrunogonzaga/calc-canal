# CalcCanal

Calculadora de precificação para marketplaces BR (Mercado Livre, Shopee, Amazon Brasil, Magalu).

## Rodar localmente

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## Build / deploy

```bash
npm run build
npm start
```

Pronto para **Vercel**: conecte o repositório e use o preset Next.js (sem config extra).

Export estático (opcional): em `next.config.ts`, adicione `output: 'export'` — note que recursos 100% client-side (localStorage, PDF) continuam funcionando no browser.

## Fórmula

Custos fixos por venda:

`base = custoProduto + embalagem + freteSeller + taxaFixaCanal`

Encargos sobre o preço de venda `P`:

- `comissão = P × (comissão% / 100)`
- `imposto = P × (imposto% / 100)`

### Modo A — custo + margem → preço sugerido

Margem desejada = lucro líquido ÷ preço de venda.

```
P = base / (1 - (comissão% + imposto% + margem%) / 100)
```

### Modo B — preço de venda → lucro

```
lucro = P - custoProduto - embalagem - freteSeller - taxaFixa - comissão - imposto
% lucro = (lucro / P) × 100
```

Implementação: [`src/lib/pricing.ts`](src/lib/pricing.ts).

## Defaults de comissão (editáveis na UI)

| Canal | Comissão % | Taxa fixa R$ |
|-------|------------|--------------|
| Mercado Livre | 16 | 6 |
| Shopee | 14 | 4 |
| Amazon Brasil | 15 | 2 |
| Magalu | 18 | 0 |

Fonte: estimativas típicas BR para MVP — ver comentários em [`src/data/channels.json`](src/data/channels.json).

## Freemium (MVP)

- 5 cálculos/dia via `localStorage`
- 6º cálculo: paywall soft + waitlist de e-mail (localStorage)
- PDF com marca d'água na versão free

## O que falta para produção pública

- Domínio + deploy Vercel
- Backend para waitlist (Resend/Supabase) e limite real de uso
- Stripe + auth para plano PRO (R$ 19,90/mês)
- Tabelas de comissão por categoria/plano
- Analytics (Plausible/PostHog)
