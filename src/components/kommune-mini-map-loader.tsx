"use client";

import dynamic from "next/dynamic";

export const KommuneMiniMap = dynamic(
  () => import("@/components/kommune-mini-map").then((m) => m.KommuneMiniMap),
  {
    ssr: false,
    loading: () => (
      <div
        className="rounded-2xl border bg-muted/40 animate-pulse"
        style={{ height: 320 }}
      />
    ),
  }
);
