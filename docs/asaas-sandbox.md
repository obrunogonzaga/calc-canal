# Homologação do Checkout Asaas

O PreçoPronto só oferece o checkout de teste quando `BILLING_SANDBOX_ENABLED=true`, `APP_ENV` não é `production` e a configuração Sandbox está completa. A conta Asaas de produção não fornece chaves para o Sandbox.

1. O titular cria uma conta separada em [sandbox.asaas.com](https://sandbox.asaas.com/) e gera uma chave Sandbox em **Integrações → Chaves de API**. Guardar a chave diretamente no gerenciador de segredos do ambiente; não enviar por chat, issue ou commit.
2. Configurar `ASAAS_ENV=sandbox`, `ASAAS_SANDBOX_API_KEY`, `ASAAS_SANDBOX_ACCOUNT_ID` e um `ASAAS_SANDBOX_WEBHOOK_TOKEN` próprio com 32–255 caracteres. O token de Webhook não é a chave de API. Habilitar `BILLING_SANDBOX_ENABLED=true` somente no ambiente de testes.
3. Expor uma origem de teste por HTTPS e apontar `BETTER_AUTH_URL` para ela. Cadastrar no Asaas o Webhook `POST /api/billing/webhook`, com o mesmo token, para `CHECKOUT_CREATED`, `CHECKOUT_PAID`, `CHECKOUT_CANCELED` e `CHECKOUT_EXPIRED`.
4. Testar primeiro checkout pendente, cartão aprovado/recusado, callback sem pagamento, evento duplicado, cancelamento/expiração e evento fora de ordem. Conferir pedido, evento, direito PRO e versão do produto separadamente. Não usar dados reais de cartão.

O retorno do navegador não ativa o plano. O servidor só concede o primeiro período após validar um `CHECKOUT_PAID` correlacionado ao pedido, à conta Sandbox e ao preço de R$ 29,90. Eventos de renovação, cancelamento da assinatura, inadimplência e reembolso ainda exigem implementação e testes próprios antes de qualquer venda real.

Fontes: [Sandbox](https://docs.asaas.com/docs/sandbox), [autenticação](https://docs.asaas.com/docs/authentication), [Checkout recorrente](https://docs.asaas.com/docs/checkout-com-assinatura-recorrente) e [eventos de Checkout](https://docs.asaas.com/docs/eventos-para-checkout).
