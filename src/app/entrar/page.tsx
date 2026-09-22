import type { Metadata } from "next";
import { AuthPage } from "@/components/account/AuthPage";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Entrar",
  robots: { index: false, follow: false },
};
export default function SignIn() {
  return (
    <AuthPage
      mode="signin"
      title="Bom ter você de volta."
      description="Entre para conferir suas simulações e continuar de onde parou."
    />
  );
}
