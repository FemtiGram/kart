"use client";

import dynamic from "next/dynamic";
import { MapLoading } from "@/components/map-loading";
import { MAP_HEIGHT } from "@/lib/map-utils";

const ReservoirMap = dynamic(
  () => import("@/components/reservoir-map").then((mod) => ({ default: mod.ReservoirMap })),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col" style={{ height: MAP_HEIGHT }}>
        <MapLoading visible loading loadingMessage="Laster kart..." />
      </div>
    ),
  }
);

export default ReservoirMap;
