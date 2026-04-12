"use client";

import { Navigation } from "lucide-react";

interface DriveLinkProps {
  lat: number;
  lon: number;
  /** "compact" (text-xs, py-2) for compact cards, "default" (text-sm, py-2.5) for detail sheets */
  size?: "compact" | "default";
  className?: string;
}

export function DriveLink({ lat, lon, size = "default", className }: DriveLinkProps) {
  const compactClass = "flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border bg-muted/50 hover:bg-muted transition-colors";
  const defaultClass = "w-full inline-flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl border bg-muted/50 hover:bg-muted transition-colors";
  return (
    <a
      href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`${size === "compact" ? compactClass : defaultClass} ${className ?? ""}`}
    >
      <Navigation className={size === "compact" ? "h-3.5 w-3.5" : "h-4 w-4"} /> Kjør hit
    </a>
  );
}
