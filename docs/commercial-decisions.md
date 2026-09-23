# Decisões comerciais do MVP — issue #3

Esta ficha registra decisões do piloto e a evidência disponível em 23/09/2026. Uma decisão de oferta, uma conta aprovada, uma integração testada no Sandbox e uma cobrança real são etapas distintas. Nenhuma credencial ou identificador bancário pertence a este documento.

| Tema | Decisão do piloto | Evidência atual | Falta para vender |
|---|---|---|---|
| Marca | PreçoPronto ainda é o nome público; **Líquido** foi proposto pelo fundador em 23/09 | Nome antigo segue no site e aplicativo enquanto a pesquisa de marca não é concluída | Decidir marca pública após avaliar risco de confusão; atualizar app, documentos e gateway de forma consistente |
| Mensalidade | **R$ 29,90/mês**, sem plano anual no MVP | Confirmado pelo fundador; valor definido no servidor em `src/lib/billing-plan.ts` e exibido na landing | Conferir valor no checkout de Produção antes de ativar cobrança |
| Limites | Free: 5 produtos; PRO: 500 produtos | Confirmados pelo fundador e aplicados no catálogo | Validar jornada completa na #16 |
| Métodos | Cartão com renovação mensal; Pix avulso por um mês, com renovação manual | Implementados e testados em parte no Asaas Sandbox | Aceites restantes do cartão/Pix nas #11 e #12; sem cobrança de Produção |
| Carência e cancelamento | Zero dias de carência após o período pago; cancelar cartão impede ciclos futuros e mantém o período pago | Decisão do fundador e comportamento integrado na #13 | Incorporar às políticas finais da #14 |
| Catálogo após downgrade | Produtos excedentes continuam salvos e legíveis; escolha dos cinco editáveis e exportação disponíveis | Implementado na #13 | Política completa de retenção e exclusão na #14 |
| Gateway | Asaas no Plano Básico gratuito | Conta de Produção com aprovação geral, dados comerciais e documentos marcados como **Aprovado** no painel; ciclo financeiro homologado parcialmente em conta Sandbox separada | Credenciais, URL/Webhook estáveis, homologação final e ativação de Produção nas #11, #12 e #16 |
| Autenticação e banco | Better Auth e PostgreSQL separados para PreçoPronto | Implementados e testados localmente; CI usa banco descartável | Provisionar banco isolado, backup e restauração na #15/#16 |
| E-mail | SMTP configurável; caixa local para testes | Cadastro e recuperação exercitados localmente | Configurar remetente externo, TLS e entrega real antes de abrir cadastro público |
| Hospedagem | VPS Hostinger como caminho comercial inicial | Capacidade consultada somente leitura; aplicação ainda local | Deploy isolado, HTTPS, monitoramento e backup na #16 |
| Fornecedor e documento fiscal | MEI/CNPJ já aprovado pelo contador; NFS-e manual no piloto | Decisão do fundador; conta Asaas PJ aprovada | Identificação do fornecedor e procedimento fiscal publicados/revisados na #14 |
| Suporte | `bruno@aifbr.com.br` como contato inicial | Decisão do fundador | Publicar canal e prazo de resposta, testar recebimento externo na #14 |
| Domínio | Fundador informou registro de `useliquido.com.br` e `useliquido.com` | Ambos resolvem para DNS da Hostinger e exibem página estacionada por HTTPS; titularidade não foi auditada | Se a marca for confirmada, escolher `.com.br` como canônico, redirecionar `.com` e configurar aplicação/HTTPS na #16 |
| Aquisição | Teto de R$ 200 para um primeiro teste; campanha não iniciada | Decisão do fundador | Só avaliar Ads após checkout estável, métricas e primeiros sinais de conversão (#15/#16) |

## Taxas e margem antes dos demais custos

O painel da conta Asaas aprovada foi consultado em 23/09/2026. Para **cartão online à vista**, ele mostrou taxa padrão de **2,99% + R$ 0,49** e promoção de **1,99% + R$ 0,49** válida até 22/12/2026; o recebimento indicado é em 32 dias, sem antecipação. Num pagamento de R$ 29,90, a taxa aritmética aproximada é R$ 1,38 no padrão (R$ 28,52 restantes) ou R$ 1,09 na promoção (R$ 28,81 restantes). Os valores efetivamente cobrados devem ser conferidos no extrato da primeira transação real, sem tomar a promoção como margem permanente.

A seção “Pix gratuito” do painel descreve movimentação por chave/QR estático, e não comprova o custo da **cobrança Pix na fatura** usada pelo checkout. A [página pública do Asaas](https://www.asaas.com/pix-asaas) informa, como tabela padrão indicativa, R$ 0,99 por fatura paga nos três primeiros meses e R$ 1,99 depois; ressalva que o contrato da conta prevalece. Para R$ 29,90, isso deixaria R$ 28,91 ou R$ 27,91 antes dos demais custos. A tarifa efetiva do Pix deste contrato permanece **não confirmada**.

Esses saldos não são lucro. Ainda faltam impostos, NFS-e, hospedagem, e-mail, suporte, reembolsos e aquisição. Não usar R$ 200 em Ads como previsão de retorno; registrar visitas, pagamentos e CAC antes de escalar.

Como teste de sensibilidade, **R$ 200 em Ads para cinco novos pagantes** significariam CAC de R$ 40 por pagante. Uma única mensalidade no cartão à taxa padrão deixaria cerca de R$ 28,52 antes dos outros custos, então esse cenário dependeria de renovação para recuperar a aquisição. Seriam necessários ao menos oito pagamentos de primeira mensalidade para cobrir R$ 200 apenas nessa conta simplificada (8 × R$ 28,52 = R$ 228,16); não é meta de conversão nem estimativa de demanda. O prazo de recebimento de 32 dias também separa venda aprovada de caixa disponível.

## Separação de ambientes e próximos gates

- **Local:** autenticação/PostgreSQL/SMTP de teste; checkout desabilitado por padrão.
- **Sandbox Asaas:** cartão/Pix, webhooks e parte do ciclo financeiro exercitados; evidências e limites em [asaas-sandbox.md](asaas-sandbox.md). Isso não comprova cobrança real ou renovação automática mensal em Produção.
- **Produção:** conta Asaas aprovada, mas sem chave de Produção no app, webhook público estável, deploy, domínio ou transação real. Ativação exige decisão e homologação próprias na #16.

Responsabilidades pendentes: o fundador aprova condições comerciais, suporte e fornecedor; contador valida procedimento fiscal; implementação entrega serviços, segurança, QA e operação. A #14 é dona dos textos públicos e da exclusão de dados. A #15 cobre métricas, alertas e backup. A #16 cobre publicação e piloto autorizado.

## Avaliação preliminar do nome Líquido

“Líquido” expressa bem a pergunta do vendedor sobre o que sobra após os custos, mas exige contexto explícito: a calculadora estima **contribuição por unidade** com as premissas informadas, não lucro líquido contábil. A busca pública do [INPI](https://www.gov.br/inpi/pt-br/servicos/marcas), feita em 23/09/2026 pela expressão exata `LIQUIDO`, retornou 30 processos, incluindo registros em vigor em diferentes classes. Há também uma [fintech Liquido](https://www.liquido.com/aboutUs) que oferece infraestrutura de pagamentos na América Latina, inclusive para comércio. Isso é sinal de possível confusão, não uma conclusão jurídica sobre disponibilidade da marca. Registro de domínio não equivale a registro de marca. Antes de substituir a identidade pública e os nomes exibidos no checkout, revisar classes e especificações relevantes no INPI e, se necessário, obter avaliação especializada.
