"use client";

import dynamic from "next/dynamic";

export const ProtectedAreasMapLoader = dynamic(
  () => import("@/components/protected-areas-map").then((m) => m.ProtectedAreasMap),
  { ssr: false }
);
