"use client";

import { useEffect, useState } from "react";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Loader2,
  Sun,
  Wind,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Weather {
  temperature: number;
  windSpeed: number;
  precipitation: number;
  symbolCode: string;
}

function weatherIcon(symbolCode: string): LucideIcon {
  const c = (symbolCode ?? "").toLowerCase();
  if (c.includes("thunder")) return CloudLightning;
  if (c.includes("snow") && c.includes("rain")) return CloudHail;
  if (c.includes("sleet")) return CloudHail;
  if (c.includes("snow")) return CloudSnow;
  if (c.includes("heavyrain") || c.includes("rain")) return CloudRain;
  if (c.includes("drizzle") || c.includes("lightrain")) return CloudDrizzle;
  if (c.includes("fog")) return CloudFog;
  if (c.includes("cloudy") && c.includes("partly")) return CloudSun;
  if (c.includes("cloudy")) return Cloud;
  if (c.includes("fair")) return CloudSun;
  return Sun;
}

export function KommuneWeather({
  lat,
  lon,
  name,
}: {
  lat: number;
  lon: number;
  name: string;
}) {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/weather?lat=${lat}&lon=${lon}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        if (cancelled) return;
        setWeather(data);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  if (loading) {
    return (
      <div className="rounded-2xl border bg-card p-4 flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Henter værdata…</p>
      </div>
    );
  }

  if (error || !weather) {
    return (
      <div className="rounded-2xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          Kunne ikke hente værdata for {name}.
        </p>
      </div>
    );
  }

  const Icon = weatherIcon(weather.symbolCode);

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center gap-4">
        <div
          className="flex items-center justify-center h-14 w-14 rounded-xl shrink-0"
          style={{ background: "var(--kv-blue-light)" }}
        >
          <Icon className="h-7 w-7" style={{ color: "var(--kv-blue)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-3xl font-extrabold tabular-nums"
            style={{ color: "var(--kv-blue)" }}
          >
            {Math.round(weather.temperature)}°C
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground/70">
            <span className="inline-flex items-center gap-1">
              <Wind className="h-3 w-3" />
              {weather.windSpeed.toLocaleString("nb-NO", {
                maximumFractionDigits: 1,
              })}{" "}
              m/s
            </span>
            <span className="inline-flex items-center gap-1">
              <Droplets className="h-3 w-3" />
              {weather.precipitation.toLocaleString("nb-NO", {
                maximumFractionDigits: 1,
              })}{" "}
              mm
            </span>
          </div>
        </div>
        <a
          href={`https://www.yr.no/nb/v%C3%A6rvarsel/daglig-tabell/${lat},${lon}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          yr.no →
        </a>
      </div>
    </div>
  );
}
