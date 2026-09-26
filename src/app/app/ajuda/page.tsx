import Link from "next/link";
import { SupportClient } from "@/components/account/SupportClient";
export default function AccountHelp() {
  return (
    <>
      <h1>Ajuda</h1>
      <h2>Calcular</h2>
      <p>Escolha o canal, informe custo, taxas e margem. Confira as premissas antes de usar o preço sugerido; ele estima contribuição por unidade, não lucro contábil.</p>
      <Link href="/app/calculadora">Abrir calculadora</Link>
      <h2>Importar CSV</h2>
      <p>Em Produtos, importe o arquivo, confira a prévia e confirme. A importação exige PRO; no Free você pode cadastrar até cinco produtos manualmente.</p>
      <Link href="/app/produtos">Abrir produtos</Link>
      <h2>Acessar a conta</h2>
      <p>Confirme o e-mail após o cadastro. Se perder a senha, peça um link na tela de entrada. Links expiram e são de uso único.</p>
      <Link href="/recuperar-senha">Recuperar senha</Link>
      <h2>Cancelar a renovação</h2>
      <p>No Plano, cancele o cartão e aguarde a confirmação. O acesso já pago continua até o fim do período. Pix é avulso e não renova sozinho.</p>
      <Link href="/app/plano">Abrir plano</Link>
      <h2>Dados e exclusão</h2>
      <p>Em Configurações, exporte sua conta em JSON sem precisar de PRO. Para pedir exclusão, confirme o pedido; se houver renovação ativa, cancele antes no Plano.</p>
      <Link href="/app/configuracoes">Abrir configurações</Link>
      <h2>Suporte</h2>
      <p>Escreva para <a href="mailto:bruno@aifbr.com.br">bruno@aifbr.com.br</a>. Atendimento de segunda a sexta, 9h às 17h (Brasília), com resposta em até 24 horas úteis. Informe seu protocolo, se houver. Não envie senhas, tokens ou dados de cartão.</p>
      <p>O suporte ajuda com uso e acesso ao produto; não inclui consultoria financeira, fiscal ou gestão dos seus anúncios.</p>
      <SupportClient />
      <p><Link href="/termos">Condições de uso</Link> · <Link href="/privacidade">Privacidade</Link></p>
    </>
  );
}
