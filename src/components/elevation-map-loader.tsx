"use client";

import dynamic from "next/dynamic";

export const ElevationMapLoader = dynamic(
  () => import("@/components/elevation-map").then((m) => m.ElevationMap),
  { ssr: false }
);
