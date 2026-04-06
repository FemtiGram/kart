import { ProtectedAreasMapLoader } from "@/components/protected-areas-map-loader";

export const metadata = {
  title: "Verneområder – Datakart",
  description: "Utforsk vernet natur i norske kommuner",
};

export default function VernPage() {
  return <ProtectedAreasMapLoader />;
}
