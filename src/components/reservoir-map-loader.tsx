"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const ReservoirMap = dynamic(
  () => import("@/components/reservoir-map").then((mod) => ({ default: mod.ReservoirMap })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center" style={{ height: "calc(100svh - 57px)" }}>
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--kv-blue)" }} />
      </div>
    ),
  }
);

export default ReservoirMap;
