import Link from "next/link";
export function InfoPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main id="conteudo" className="shell prose">
      <Link href="/">← Voltar à calculadora</Link>
      <h1>{title}</h1>
      {children}
    </main>
  );
}
