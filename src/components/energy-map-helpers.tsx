"use client";

import { Wind, Droplets, Fuel } from "lucide-react";
import L from "leaflet";

// ─── Shared compound types ─────────────────────────────────

export interface HydroStationData {
  station: { id: string; name: string; river: string | null; distanceKm: number } | null;
  discharge: number | null;
  waterLevel: number | null;
  percentile: { p25: number | null; p50: number | null; p75: number | null; p90: number | null; min: number | null; max: number | null } | null;
}

// ─── Types ──────────────────────────────────────────────────

export type EnergyType = "vind" | "vann" | "havvind" | "oilgas";
export type WindStatus = "operational" | "construction" | "approved" | "rejected";

export interface EnergyPlant {
  id: number;
  name: string;
  owner: string | null;
  municipality: string | null;
  county: string | null;
  lat: number;
  lon: number;
  capacityMW: number | null;
  productionGWh: number | null;
  type: EnergyType;
  windStatus?: WindStatus;
  turbineCount?: number | null;
  fallHeight?: number | null;
  yearBuilt?: number | null;
  river?: string | null;
}

export interface WindTurbine {
  id: number;
  lat: number;
  lon: number;
  plantName: string | null;
}

export interface OilGasFacility {
  id: number;
  name: string;
  kind: string;
  phase: string;
  functions: string | null;
  operator: string | null;
  fieldName: string | null;
  waterDepth: number | null;
  yearStartup: number | null;
  isSurface: boolean;
  factPageUrl: string | null;
  lat: number;
  lon: number;
}

export interface ProductionYear {
  year: number;
  oil: number;
  gas: number;
  ngl: number;
  condensate: number;
  oe: number;
  water: number;
}

export type ProductionByField = Record<string, ProductionYear[]>;

export interface Pipeline {
  id: number;
  name: string;
  medium: string | null;
  phase: string | null;
  dimension: number | null;
  fromFacility: string | null;
  toFacility: string | null;
  belongsTo: string | null;
  path: [number, number][];
}

export interface HavvindZone {
  id: number;
  name: string;
  typeAnlegg: string;
  arealKm2: number | null;
  minDistanceKm: number | null;
  nveUrl: string | null;
  center: { lat: number; lon: number };
  polygon: [number, number][][];
}

// ─── Constants ──────────────────────────────────────────────

export const HAVVIND_COLOR = "#7c3aed";
export const OILGAS_COLOR = "#d97706";
export const MW_THRESHOLD = 10; // Default: only show plants >= 10 MW

export const TYPE_META: Record<EnergyType, { label: string; color: string; icon: typeof Wind }> = {
  vind: { label: "Vindkraft", color: "#0369a1", icon: Wind },
  vann: { label: "Vannkraft", color: "#0e7490", icon: Droplets },
  havvind: { label: "Havvind (planlagt)", color: HAVVIND_COLOR, icon: Wind },
  oilgas: { label: "Olje & gass", color: OILGAS_COLOR, icon: Fuel },
};

export const WIND_STATUS_META: Record<WindStatus, { label: string; color: string }> = {
  operational: { label: "I drift", color: "#0369a1" },
  construction: { label: "Under bygging", color: "#ca8a04" },
  approved: { label: "Godkjent", color: "var(--kv-positive)" },
  rejected: { label: "Avslått", color: "var(--kv-negative)" },
};

export { TILE_LAYERS, type TileLayerKey } from "@/lib/map-utils";

// ─── Label formatters ───────────────────────────────────────

export function titleCase(s: string): string {
  return s.toLowerCase().replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());
}

const FUNCTION_NO: Record<string, string> = {
  "oil producer": "Oljeprodusent",
  "gas producer": "Gassprodusent",
  "oil/gas producer": "Olje-/gassprodusent",
  "gas injection": "Gassinjeksjon",
  "water injection": "Vanninjeksjon",
  "processing": "Prosessering",
  "storage": "Lagring",
  "loading": "Lasting",
  "quarters": "Boligkvarter",
  "wellhead": "Brønnhode",
  "drilling": "Boring",
  "riser": "Stigerør",
  "flare": "Fakkel",
  "compression": "Kompresjon",
  "metering": "Måling",
};

export function formatFunctions(raw: string): string {
  return raw.split(" - ").map((f) => {
    const key = f.trim().toLowerCase();
    return FUNCTION_NO[key] ?? titleCase(f.trim());
  }).join(", ");
}

export function formatKind(raw: string): string {
  const map: Record<string, string> = {
    "MULTI WELL TEMPLATE": "Flerbrønnmal",
    "FIXED": "Fast plattform",
    "JACKET 4 LEGS": "Jacket (4 ben)",
    "JACKET 6 LEGS": "Jacket (6 ben)",
    "JACKET 8 LEGS": "Jacket (8 ben)",
    "CONDEEP 3 SHAFTS": "Condeep (3 skaft)",
    "CONDEEP 4 SHAFTS": "Condeep (4 skaft)",
    "SEMI SUBMERSIBLE": "Halvt nedsenkbar",
    "FPSO": "FPSO",
    "FSO": "FSO",
    "FSU": "FSU",
    "JACK-UP": "Jack-up",
    "TLP": "TLP",
    "SPAR": "Spar",
    "SUBSEA TEMPLATE": "Undervannsmal",
    "SINGLE WELL TEMPLATE": "Enkeltbrønnmal",
    "TENSION LEG": "Strekkstag",
    "DRILL SHIP": "Boreskip",
    "LOADING SYSTEM": "Lastesystem",
  };
  return map[raw] ?? titleCase(raw);
}

// ─── Icon builders (with caching) ───────────────────────────

const energyIconCache = new Map<string, L.DivIcon>();
export function energyIcon(
  isSelected: boolean,
  inverted: boolean,
  type: EnergyType,
  capacityMW: number | null,
  windStatus?: WindStatus
): L.DivIcon {
  const sizeBucket = capacityMW != null && capacityMW > 200 ? "lg" : capacityMW != null && capacityMW >= 50 ? "md" : "sm";
  const statusKey = windStatus ?? "operational";
  const key = `${type}-${sizeBucket}-${isSelected}-${inverted}-${statusKey}`;
  const cached = energyIconCache.get(key);
  if (cached) return cached;

  const size = sizeBucket === "lg" ? 32 : sizeBucket === "md" ? 30 : 26;
  const iconSize = Math.round(size * 0.5);
  const color = type === "vind" && windStatus && windStatus !== "operational"
    ? WIND_STATUS_META[windStatus].color
    : TYPE_META[type].color;

  const bg = inverted ? (isSelected ? "#24374c" : color) : "white";
  const iconColor = inverted ? "white" : isSelected ? "#24374c" : color;
  const border = isSelected
    ? "#24374c"
    : inverted
      ? "rgba(255,255,255,0.3)"
      : "rgba(0,0,0,0.15)";

  const svgIcon =
    type === "vind"
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${iconSize}" height="${iconSize}" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.8 19.6A2 2 0 1 0 14 16H2"/><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/><path d="M9.8 4.4A2 2 0 1 1 11 8H2"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${iconSize}" height="${iconSize}" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>`;

  const icon = L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;line-height:0;background:${bg};border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.25);border:2.5px solid ${border}">${svgIcon}</div>`,
  });
  energyIconCache.set(key, icon);
  return icon;
}

const turbineIconCache = new Map<string, L.DivIcon>();
export function turbineIcon(inverted: boolean): L.DivIcon {
  const key = `${inverted}`;
  const cached = turbineIconCache.get(key);
  if (cached) return cached;
  const size = 16;
  const color = inverted ? "white" : "#0369a1";
  const bg = inverted ? "#0369a1" : "white";
  const icon = L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;background:${bg};border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.2);border:1.5px solid ${inverted ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.1)"}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.8 19.6A2 2 0 1 0 14 16H2"/><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/><path d="M9.8 4.4A2 2 0 1 1 11 8H2"/></svg></div>`,
  });
  turbineIconCache.set(key, icon);
  return icon;
}

const oilgasIconCache = new Map<string, L.DivIcon>();
export function oilgasIcon(isSelected: boolean, inverted: boolean, isSurface: boolean): L.DivIcon {
  const key = `${isSelected}-${inverted}-${isSurface}`;
  const cached = oilgasIconCache.get(key);
  if (cached) return cached;
  const size = isSurface ? 28 : 22;
  const iconSize = isSurface ? 14 : 10;
  const bg = inverted ? (isSelected ? "#24374c" : OILGAS_COLOR) : "white";
  const iconColor = inverted ? "white" : (isSelected ? "#24374c" : OILGAS_COLOR);
  const border = isSelected ? "#24374c" : inverted ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.15)";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${iconSize}" height="${iconSize}" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 22h18"/><path d="M6 18V2"/><path d="m6 7 5-1v4l-5 1"/><circle cx="18" cy="16" r="4"/><path d="m18 13-1 5h2l-1-5"/></svg>`;
  const icon = L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;line-height:0;background:${bg};border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.25);border:2.5px solid ${border}${!isSurface ? ";opacity:0.7" : ""}">${svg}</div>`,
  });
  oilgasIconCache.set(key, icon);
  return icon;
}

const havvindIconCache = new Map<string, L.DivIcon>();
export function havvindIcon(isSelected: boolean, inverted: boolean): L.DivIcon {
  const key = `${isSelected}-${inverted}`;
  const cached = havvindIconCache.get(key);
  if (cached) return cached;
  const size = 28;
  const bg = inverted ? (isSelected ? "#24374c" : HAVVIND_COLOR) : "white";
  const iconColor = inverted ? "white" : (isSelected ? "#24374c" : HAVVIND_COLOR);
  const border = isSelected ? "#24374c" : inverted ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.15)";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.8 19.6A2 2 0 1 0 14 16H2"/><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/><path d="M9.8 4.4A2 2 0 1 1 11 8H2"/></svg>`;
  const icon = L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;line-height:0;background:${bg};border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.25);border:2.5px solid ${border}">${svg}</div>`,
  });
  havvindIconCache.set(key, icon);
  return icon;
}
