import { IncomeMapLoader } from "@/components/income-map-loader";

export const metadata = {
  title: "Inntektskart – MapGram",
  description: "Utforsk median inntekt etter skatt i alle norske kommuner",
};

export default function LonnPage() {
  return <IncomeMapLoader />;
}
