# Troca de cartão da assinatura — consulta ao Asaas

Estado em 23/09/2026: **consulta enviada; aguardando resposta do Asaas**. O Líquido usa o Checkout hospedado do Asaas para criar assinaturas mensais de cartão no Sandbox. O app não captura dados do cartão. A issue #11 exige homologar a troca do cartão sem criar assinatura duplicada nem cobrar fora do ciclo.

## Evidência pública

- O [Checkout hospedado](https://docs.asaas.com/docs/checkout-asaas) cobre a contratação recorrente, mas não descreve uma página para trocar o cartão de uma assinatura existente.
- A [API de troca do cartão](https://docs.asaas.com/reference/atualizar-cartao-de-credito-assinatura) aceita dados do cartão ou um token associado ao cliente. Ela preserva a assinatura, não cobra imediatamente e atualiza cobranças pendentes.
- A [ajuda sobre recorrência](https://central.ajuda.asaas.com/hc/pt-br/articles/31975240886555-Como-funcionam-as-cobran%C3%A7as-por-assinatura-recorrentes) orienta o pagador a abrir a fatura e informar outro cartão após falha na captura. **Não esclarece** se isso substitui o cartão das próximas cobranças ou só paga a fatura vencida.
- O Asaas indica [integracoes@asaas.com.br](https://www.asaas.com/desenvolvedores) para dúvidas de integração.

Não usar `invoiceUrl` como botão de “trocar cartão” antes de confirmar seu efeito sobre a assinatura. Não pedir nem enviar credenciais, dados de cartão, IDs de clientes ou assinaturas na consulta inicial.

## Mensagem enviada

Enviada com autorização do titular em 23/09/2026 às 19:08 UTC. A API do Hostinger Mail respondeu HTTP 204 e a mensagem foi conferida na pasta Enviados com destinatário, assunto e texto corretos. Isso comprova o envio pela caixa, não entrega, leitura ou resposta humana.

O Asaas retornou uma confirmação automática às 19:08 UTC com protocolo **1739686**, informando que o atendimento será direcionado aos times. Ainda não respondeu às perguntas técnicas.

**De (proposto):** bruno@aifbr.com.br

**Para:** integracoes@asaas.com.br
**Assunto:** Asaas Checkout recorrente — troca de cartão em página hospedada

Olá, equipe de Integrações do Asaas.

Estamos integrando uma assinatura mensal de cartão pelo Asaas Checkout. O pagador informa o cartão na página hospedada por vocês; nossa aplicação não captura dados do cartão. Precisamos oferecer a troca do cartão de uma assinatura já ativa, sem cobrança imediata, preservando a mesma assinatura e as próximas renovações.

Existe uma página ou link hospedado pelo Asaas para o próprio pagador informar um novo cartão? Se existir, como geramos esse link para a assinatura correta, quais são sua validade e autenticação, e como confirmamos pelo Sandbox/API/Webhook que a troca foi concluída?

A ajuda sobre recorrência orienta o pagador a informar outro cartão na fatura após uma captura recusada. Ao pagar essa fatura com um novo cartão, o Asaas também atualiza o cartão das futuras cobranças da mesma assinatura? Esse caminho funciona antes do vencimento, sem uma cobrança pendente ou recusada? Ele preserva o ID da assinatura e evita criar outra recorrência?

Conhecemos o endpoint `PUT /v3/subscriptions/{id}/creditCard`, mas ele exige dados do cartão ou um token. Se não houver fluxo hospedado, existe uma solução oficial para obter esse token sem nossa aplicação receber número do cartão/CVV? Quais passos vocês recomendam para homologar a troca e uma recusa de renovação no Sandbox?

Obrigado.

## Próximo passo

Após resposta escrita do Asaas, confirmar o comportamento em uma assinatura fictícia no Sandbox: mesmo ID da assinatura, cartão das próximas cobranças atualizado, nenhuma cobrança imediata inesperada, nenhum segundo checkout e Webhooks reconciliados. Só então implementar a ação na área logada e atualizar o aceite da #11.
