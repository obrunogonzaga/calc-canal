import type { Metadata } from "next";
import { AuthPage } from "@/components/account/AuthPage";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Recuperar acesso",
  robots: { index: false, follow: false },
};
export default function Forgot() {
  return (
    <AuthPage
      mode="forgot"
      title="Vamos recuperar seu acesso."
      description="Informe o e-mail usado na conta. Você receberá um link para definir outra senha."
    />
  );
}
