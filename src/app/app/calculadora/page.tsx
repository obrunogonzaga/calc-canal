import { Calculator } from "@/components/Calculator";
export default function AccountCalculator() {
  return (
    <>
      <div className="account-title">
        <h1>Vamos encontrar seu preço?</h1>
        <p>Faça a conta e guarde o resultado para consultar depois.</p>
      </div>
      <Calculator allowAccount accountMode />
    </>
  );
}
