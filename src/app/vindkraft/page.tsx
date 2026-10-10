import { WindPowerMapLoader } from "@/components/wind-power-map-loader";

// Unlisted deep link (not in nav or sitemap): shareable, but kept out of
// search results — /energikart is the indexed home for wind power. The
// self-canonical stays so it doesn't inherit the layout's "/" default.
export const metadata = {
  title: "Vindkraft",
  description:
    "Vindkraftverk i Norge. Se installert kapasitet, antall turbiner og årlig produksjon på kart.",
  alternates: { canonical: "/vindkraft" },
  robots: { index: false, follow: true },
};

export default function VindkraftPage() {
  return (
    <>
      <h1 className="sr-only">Vindkraft</h1>
      <WindPowerMapLoader />
    </>
  );
}
