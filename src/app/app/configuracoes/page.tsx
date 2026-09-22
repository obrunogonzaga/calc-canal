import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireVerifiedSession } from "@/lib/server/auth";
export default async function Settings() {
  const session = await requireVerifiedSession(await headers());
  if (!session) redirect("/entrar");
  return (
    <>
      <h1>Configurações</h1>
      <dl className="account-settings">
        <div>
          <dt>Nome</dt>
          <dd>{session.user.name}</dd>
        </div>
        <div>
          <dt>E-mail confirmado</dt>
          <dd>{session.user.email}</dd>
        </div>
      </dl>
      <h2>Segurança</h2>
      <p>
        Para trocar sua senha, solicite um link de recuperação. A troca encerra
        as sessões anteriores.
      </p>
      <Link className="button secondary" href="/recuperar-senha">
        Trocar senha por e-mail
      </Link>
      <p className="field-hint">
        Para solicitações sobre dados da conta, consulte a ajuda. Não envie
        senhas ou tokens em solicitações públicas.
      </p>
      <Link className="text-link" href="/app/ajuda">
        Ajuda e privacidade
      </Link>
    </>
  );
}
