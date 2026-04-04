"use client";

import dynamic from "next/dynamic";

export const EnergyMapLoader = dynamic(
  () => import("@/components/energy-map").then((m) => m.EnergyMap),
  { ssr: false }
);
