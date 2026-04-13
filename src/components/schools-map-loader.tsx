"use client";

import dynamic from "next/dynamic";
import { MapLoading } from "@/components/map-loading";
import { MAP_HEIGHT } from "@/lib/map-utils";

export const SchoolsMapLoader = dynamic(
  () => import("@/components/schools-map").then((m) => m.SchoolsMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col" style={{ height: MAP_HEIGHT }}>
        <MapLoading visible loading loadingMessage="Laster kart..." />
      </div>
    ),
  }
);
