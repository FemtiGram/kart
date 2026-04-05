"use client";

import dynamic from "next/dynamic";

export const ChargingMapLoader = dynamic(
  () => import("@/components/charging-map").then((m) => m.ChargingMap),
  { ssr: false }
);
