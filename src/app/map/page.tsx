import { ElevationMapLoader } from "@/components/elevation-map-loader";

export const metadata = {
  title: "Høydekart – MapGram",
  description: "Søk etter en adresse og finn høyden over havet",
};

export default function MapPage() {
  return (
    <ElevationMapLoader />
  );
}
