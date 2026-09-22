import type { Metadata } from "next";
import { AuthPage } from "@/components/account/AuthPage";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Nova senha",
  robots: { index: false, follow: false },
};
export default function Reset() {
  return (
    <AuthPage
      mode="reset"
      title="Uma nova senha para sua conta."
      description="Escolha uma senha que você não usa em outros serviços."
    />
  );
}
