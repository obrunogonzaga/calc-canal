import type { Metadata } from "next";
import { AuthPage } from "@/components/account/AuthPage";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Criar conta",
  robots: { index: false, follow: false },
};
export default function SignUp() {
  return (
    <AuthPage
      mode="signup"
      title="Sua próxima conta começa aqui."
      description="Crie seu acesso gratuito e continue a simulação que você começou."
    />
  );
}
