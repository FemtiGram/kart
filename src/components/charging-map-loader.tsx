"use client";

import dynamic from "next/dynamic";
import type { ChargingRegion } from "@/components/charging-map";

const ChargingMapDynamic = dynamic(
  () => import("@/components/charging-map").then((m) => m.ChargingMap),
  { ssr: false }
);

export function ChargingMapLoader({ region }: { region?: ChargingRegion }) {
  return <ChargingMapDynamic region={region} />;
}
