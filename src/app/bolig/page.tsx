import { BoligMapLoader } from "@/components/bolig-map-loader";

export const metadata = {
  title: "Boligpriser",
  description:
    "Utforsk boligpriser i alle norske kommuner. Gjennomsnittlig kvadratmeterpris for eneboliger, småhus og blokkleiligheter.",
};

export default function BoligPage() {
  return <BoligMapLoader />;
}
