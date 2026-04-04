"use client";

import dynamic from "next/dynamic";

export const WindPowerMapLoader = dynamic(
  () => import("@/components/wind-power-map").then((m) => m.WindPowerMap),
  { ssr: false }
);
