import { WindPowerMapLoader } from "@/components/wind-power-map-loader";

export const metadata = {
  title: "Vindkraft – Datakart",
  description:
    "Vindkraftverk i Norge. Se installert kapasitet, antall turbiner og årlig produksjon på kart.",
};

export default function VindkraftPage() {
  return <WindPowerMapLoader />;
}
