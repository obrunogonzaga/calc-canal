# Issue #14 — textos para revisão

Este documento distingue decisões do fundador, comportamento implementado e validações ainda necessárias. O app permanece um piloto restrito; a aprovação comercial, jurídica e fiscal dos textos finais é separada da implementação.

## Condições confirmadas

- PRO custa R$ 29,90 por mês no cartão recorrente; Pix compra um mês avulso. Free permite até 5 produtos, PRO até 500. Importação CSV e recálculo em lote exigem PRO. Exportação do catálogo e dos dados próprios funciona no Free.
- O cartão pode ser cancelado em Plano. A confirmação impede novos ciclos e preserva o período já pago. Carência após vencimento: zero dias. Pix não renova sozinho.
- Reembolso integral quando solicitado em até 7 dias corridos após **cada compra**, inclusive primeira assinatura, renovação e Pix. O processamento exige conferir a cobrança no provedor e aplicar os efeitos sobre o direito de acesso da compra correspondente; o app não emite reembolso automaticamente.
- Suporte inicial: bruno@aifbr.com.br, segunda a sexta, 9h às 17h (Brasília), resposta em até 24 horas úteis. Entrega externa ainda precisa ser comprovada.
- Fornecedor MEI/CNPJ e NFS-e manual foram decididos para o piloto. Recibo do gateway não é nota fiscal.
- O cálculo estima contribuição por unidade com as premissas informadas, não lucro contábil ou aconselhamento fiscal.

## Texto proposto de reembolso

“Se você solicitar reembolso em até 7 dias corridos de cada compra do PRO, devolvemos integralmente o valor daquela compra, seja cartão inicial, renovação ou Pix. Entre em contato pelo suporte informando a compra. O reembolso será processado após a conferência da cobrança. O direito de acesso relativo à compra reembolsada será revisto, sem afetar outros períodos válidos.”

**Revisão pendente:** responsável aprovar o texto final, canal de solicitação, prazo e meio da devolução e procedimento fiscal/contábil. Não publicar como política final até a revisão.

## Exclusão e retenção

O pedido autenticado exige a confirmação “EXCLUIR” e gera protocolo. A API recusa o pedido se a renovação do cartão não estiver confirmadamente cancelada ou se houver checkout aberto. O pedido fica em análise; nenhuma conta é apagada automaticamente. O operador precisa conferir novamente a recorrência no gateway e no banco antes de concluir o encerramento.

**Pendente:** definir prazos por categoria (conta, catálogo, simulações, registros de cobrança e fiscais, backups, protocolos), base e responsável pela retenção obrigatória, prazo de resposta e conclusão, e procedimento de anonimização/eliminação. O contador e o responsável jurídico/fiscal devem aprovar a matriz antes da primeira exclusão real. O protocolo não promete um prazo não decidido.

## Gates de publicação

- [ ] Aprovar termos, privacidade, renovação, cancelamento e reembolso finais.
- [ ] Validar identificação fiscal pública, NFS-e manual e retenções obrigatórias.
- [ ] Comprovar recebimento externo e resposta do suporte.
- [ ] Homologar ambiente público, checkout, cancelamento e rotina operacional de exclusão.
