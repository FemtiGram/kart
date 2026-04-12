"use client";

import { Loader2 } from "lucide-react";
import { AnimatedCount } from "@/lib/map-utils";

interface MapLoadingProps {
  visible: boolean;
  loading: boolean;
  counting?: boolean;
  count?: number;
  countLabel?: string;
  loadingMessage?: string;
}

export function MapLoading({
  visible,
  loading,
  counting = false,
  count = 0,
  countLabel = "datapunkter lastet",
  loadingMessage = "Henter data...",
}: MapLoadingProps) {
  if (!visible) return null;
  return (
    <div className="absolute inset-0 z-[1000] bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-center px-6">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--kv-blue)" }} />
        {counting ? (
          <>
            <p className="text-2xl font-extrabold tabular-nums" style={{ color: "var(--kv-blue)" }}>
              <AnimatedCount target={count} duration={700} />
            </p>
            <p className="text-sm text-foreground/70">{countLabel}</p>
          </>
        ) : loading ? (
          <p className="text-sm text-foreground/70">{loadingMessage}</p>
        ) : null}
      </div>
    </div>
  );
}
