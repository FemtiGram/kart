import { CabinMapLoader } from "@/components/cabin-map-loader";

export const metadata = {
  title: "Turisthytter – MapGram",
  description: "Utforsk DNT-hytter og turisthytter i Norge på kart. Se type, høyde og sengeplasser.",
};

export default function HytterPage() {
  return <CabinMapLoader />;
}
