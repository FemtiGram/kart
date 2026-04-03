"use client";

import dynamic from "next/dynamic";

export const CabinMapLoader = dynamic(
  () => import("@/components/cabin-map").then((m) => m.CabinMap),
  { ssr: false }
);
