"use client";

import dynamic from "next/dynamic";
import { MapLoading } from "@/components/map-loading";
import { MAP_HEIGHT } from "@/lib/map-utils";

export const HealthMapLoader = dynamic(
  () => import("@/components/health-map").then((m) => m.HealthMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col" style={{ height: MAP_HEIGHT }}>
        <MapLoading visible loading loadingMessage="Laster kart..." />
      </div>
    ),
  }
);
