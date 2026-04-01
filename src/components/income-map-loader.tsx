"use client";

import dynamic from "next/dynamic";

export const IncomeMapLoader = dynamic(
  () => import("@/components/income-map").then((m) => m.IncomeMap),
  { ssr: false }
);
