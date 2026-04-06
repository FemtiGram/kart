import { ChargingMapLoader } from "@/components/charging-map-loader";

export const metadata = {
  title: "Ladestasjoner – Datakart",
  description: "Se alle elbilladestasjoner i Norge på kart med kontakttyper og kapasitet",
};

export default function LadingPage() {
  return <ChargingMapLoader />;
}
