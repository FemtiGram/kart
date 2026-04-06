import { EnergyMapLoader } from "@/components/energy-map-loader";

export const metadata = {
  title: "Energikart – Datakart",
  description:
    "Norges fornybare kraftverk på kart. Vindkraft og vannkraft med kapasitet, produksjon og eier.",
};

export default function EnergiPage() {
  return <EnergyMapLoader />;
}
