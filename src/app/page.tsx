import { Calculator } from "@/components/Calculator";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <span className="text-lg font-bold tracking-tight text-teal-700">
            CalcCanal
          </span>
          <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800">
            Beta
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <section className="mb-10 text-center sm:text-left">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Precifique no marketplace certo, com lucro claro
          </h1>
          <p className="mt-3 text-base text-slate-600 sm:text-lg">
            Calcule preço de venda e lucro líquido no{" "}
            <strong>Mercado Livre</strong>, <strong>Shopee</strong>,{" "}
            <strong>Amazon Brasil</strong> e <strong>Magalu</strong>. Feito para
            sellers brasileiros — rápido, no celular, sem planilha.
          </p>
          <ul className="mt-6 flex flex-wrap justify-center gap-2 sm:justify-start">
            {["Comissão + imposto", "Dois modos de cálculo", "Breakdown completo"].map(
              (item) => (
                <li
                  key={item}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
                >
                  {item}
                </li>
              )
            )}
          </ul>
        </section>

        <Calculator />

        <footer className="mt-12 border-t border-slate-200 pt-8 text-center text-xs text-slate-500">
          <p>
            Valores de comissão são estimativas editáveis — confira sempre o
            painel do marketplace.
          </p>
          <p className="mt-2">© {new Date().getFullYear()} CalcCanal</p>
        </footer>
      </main>
    </div>
  );
}
