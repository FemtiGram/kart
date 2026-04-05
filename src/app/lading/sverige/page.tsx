import { ChargingMapLoader } from "@/components/charging-map-loader";

export const metadata = {
  title: "Ladestasjoner Sverige – MapGram",
  description: "Se elbilladestasjoner i Sverige på kart med kontakttyper og kapasitet",
};

export default function LadingSverigePage() {
  return <ChargingMapLoader region="se" />;
}
