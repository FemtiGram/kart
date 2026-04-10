import { WindPowerMapLoader } from "@/components/wind-power-map-loader";

export const metadata = {
  title: "Vindkraft – Datakart",
  description:
    "Vindkraftverk i Norge. Se installert kapasitet, antall turbiner og årlig produksjon på kart.",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Dataset",
  name: "Vindkraftverk i Norge",
  description: "Interaktivt kart over vindkraftverk i Norge med installert kapasitet (MW), antall turbiner og årlig produksjon (GWh).",
  url: "https://datakart.no/vindkraft",
  creator: { "@type": "Organization", name: "NVE" },
  license: "https://data.norge.no/nlod/no/2.0",
};

export default function VindkraftPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <WindPowerMapLoader />
    </>
  );
}
