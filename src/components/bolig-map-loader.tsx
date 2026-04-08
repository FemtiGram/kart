"use client";

import dynamic from "next/dynamic";

export const BoligMapLoader = dynamic(
  () => import("@/components/bolig-map").then((m) => m.BoligMap),
  { ssr: false }
);
