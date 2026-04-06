import { IncomeMapLoader } from "@/components/income-map-loader";

export const metadata = {
  title: "Inntektskart – Datakart",
  description: "Utforsk median inntekt etter skatt i alle norske kommuner",
};

export default function LonnPage() {
  return <IncomeMapLoader />;
}
