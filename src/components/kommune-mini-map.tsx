"use client";

import { MapContainer, TileLayer, Polygon, Marker, Tooltip, useMap } from "react-leaflet";
import { useEffect, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  chargingIcon,
  cabinIcon,
  reservoirIcon,
  energyIcon,
  type CabinType,
} from "@/components/map-icons";
import { TileToggle } from "@/components/tile-toggle";
import type {
  CabinMarker,
  ChargingMarker,
  EnergyMarker,
  ReservoirMarker,
} from "@/lib/kommune-profiles";
import { Zap, Home, Droplets, BatteryCharging, Map as MapIcon, Layers } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type LayerKey = "energy" | "charging" | "cabin" | "reservoir";

const TILE_LAYERS = {
  kart: {
    label: "Kart",
    url: "https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png",
  },
  gråtone: {
    label: "Gråtone",
    url: "https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png",
  },
} as const;

type TileLayerKey = keyof typeof TILE_LAYERS;

interface Props {
  /** Simplified outline as [lat, lon] rings. */
  outline: Array<Array<[number, number]>>;
  /** [minLat, minLon, maxLat, maxLon] */
  bbox: [number, number, number, number];
  name: string;
  layers: {
    energy: EnergyMarker[];
    charging: ChargingMarker[];
    cabin: CabinMarker[];
    reservoir: ReservoirMarker[];
  };
  /** Total counts — shown on pills. Used to render "+X flere" when capped. */
  totals: {
    energy: number;
    charging: number;
    cabin: number;
    reservoir: number;
  };
}

function FitBounds({ bbox }: { bbox: [number, number, number, number] }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLngBounds([bbox[0], bbox[1]], [bbox[2], bbox[3]]);
    map.fitBounds(bounds, { padding: [24, 24], animate: false });
  }, [bbox, map]);
  return null;
}

interface PillConfig {
  key: LayerKey;
  label: string;
  icon: LucideIcon;
  color: string;
}

const PILLS: PillConfig[] = [
  { key: "energy", label: "Kraftverk", icon: Zap, color: "#0369a1" },
  { key: "charging", label: "Lading", icon: BatteryCharging, color: "#15803d" },
  { key: "cabin", label: "Hytter", icon: Home, color: "#b91c1c" },
  { key: "reservoir", label: "Magasiner", icon: Droplets, color: "#0891b2" },
];

export function KommuneMiniMap({ outline, bbox, name, layers, totals }: Props) {
  const [active, setActive] = useState<Set<LayerKey>>(new Set());
  const [tileLayer, setTileLayer] = useState<TileLayerKey>("kart");

  if (outline.length === 0) return null;

  const toggle = (key: LayerKey) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <>
      <div
        className="relative rounded-2xl overflow-hidden border"
        style={{ height: 420 }}
      >
        <MapContainer
          center={[(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]}
          zoom={9}
          zoomControl={true}
          scrollWheelZoom={false}
          dragging={true}
          doubleClickZoom={true}
          touchZoom={true}
          keyboard={true}
          attributionControl={true}
          style={{ width: "100%", height: "100%", background: "#eae8e3" }}
        >
          <TileLayer
            key={tileLayer}
            url={TILE_LAYERS[tileLayer].url}
            attribution='&copy; <a href="https://www.kartverket.no/">Kartverket</a>'
            maxZoom={17}
          />
          <Polygon
            positions={outline}
            pathOptions={{
              color: "#24374c",
              weight: 2.5,
              fillColor: "#24374c",
              fillOpacity: 0.12,
            }}
          />

          {active.has("energy") &&
            layers.energy.map((p) => (
              <Marker
                key={`energy-${p.id}`}
                position={[p.lat, p.lon]}
                icon={energyIcon(false, tileLayer === "gråtone", p.type, p.capacityMW)}
              >
                <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                  <div className="text-xs">
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-foreground/70">
                      {p.type === "vann" ? "Vannkraft" : "Vindkraft"}
                      {p.capacityMW != null
                        ? ` · ${p.capacityMW.toLocaleString("nb-NO")} MW`
                        : ""}
                    </div>
                  </div>
                </Tooltip>
              </Marker>
            ))}

          {active.has("charging") &&
            layers.charging.map((s) => (
              <Marker
                key={`charging-${s.id}`}
                position={[s.lat, s.lon]}
                icon={chargingIcon(false, tileLayer === "gråtone")}
              >
                <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                  <div className="text-xs">
                    <div className="font-semibold">{s.name}</div>
                    {s.maxKw != null && (
                      <div className="text-foreground/70">
                        Maks {s.maxKw} kW
                      </div>
                    )}
                  </div>
                </Tooltip>
              </Marker>
            ))}

          {active.has("cabin") &&
            layers.cabin.map((c) => (
              <Marker
                key={`cabin-${c.id}`}
                position={[c.lat, c.lon]}
                icon={cabinIcon(c.cabinType as CabinType, false, tileLayer === "gråtone")}
              >
                <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                  <div className="text-xs">
                    <div className="font-semibold">{c.name}</div>
                    {c.beds != null && (
                      <div className="text-foreground/70">{c.beds} senger</div>
                    )}
                  </div>
                </Tooltip>
              </Marker>
            ))}

          {active.has("reservoir") &&
            layers.reservoir.map((r) => (
              <Marker
                key={`reservoir-${r.id}`}
                position={[r.lat, r.lon]}
                icon={reservoirIcon(false, tileLayer === "gråtone")}
              >
                <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                  <div className="text-xs">
                    <div className="font-semibold">{r.name}</div>
                    {r.volumeMm3 != null && (
                      <div className="text-foreground/70">
                        {r.volumeMm3.toLocaleString("nb-NO", {
                          maximumFractionDigits: 1,
                        })}{" "}
                        Mm³
                      </div>
                    )}
                  </div>
                </Tooltip>
              </Marker>
            ))}

          <FitBounds bbox={bbox} />
        </MapContainer>
        <div className="absolute top-3 right-3 z-[999]">
          <TileToggle
            value={tileLayer}
            onChange={setTileLayer}
            options={[
              { value: "kart", label: "Kart", icon: <MapIcon className="h-3.5 w-3.5" /> },
              { value: "gråtone", label: "Gråtone", icon: <Layers className="h-3.5 w-3.5" /> },
            ]}
          />
        </div>
        <span className="sr-only">Kart av {name}</span>
      </div>

      {/* Layer toggles */}
      <div className="mt-3 flex flex-wrap gap-2">
        {PILLS.map((pill) => {
          const count = totals[pill.key];
          const isActive = active.has(pill.key);
          const disabled = count === 0;
          const Icon = pill.icon;
          return (
            <button
              key={pill.key}
              type="button"
              onClick={() => !disabled && toggle(pill.key)}
              disabled={disabled}
              aria-pressed={isActive}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                disabled
                  ? "border-border bg-muted/30 text-muted-foreground/50 cursor-not-allowed"
                  : isActive
                    ? "border-transparent text-white"
                    : "border-border bg-card text-foreground hover:bg-muted"
              }`}
              style={isActive ? { background: pill.color } : undefined}
            >
              <Icon className="h-3.5 w-3.5" />
              {pill.label}
              <span
                className={`tabular-nums ${
                  isActive
                    ? "text-white/80"
                    : disabled
                      ? ""
                      : "text-muted-foreground"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
