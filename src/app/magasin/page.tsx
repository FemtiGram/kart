import type { Metadata } from "next";
import ReservoirMap from "@/components/reservoir-map-loader";

export const metadata: Metadata = {
  title: "Magasinkart — Datakart",
  description: "Utforsk regulerte vannmagasiner i Norge med sanntids vanndata fra NVE.",
};

export default function MagasinPage() {
  return <ReservoirMap />;
}
