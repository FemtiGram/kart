"use client";

import L from "leaflet";

// Re-export the energy icons so consumers (like the kommune mini-map) can
// import every marker factory from a single module.
export { energyIcon, turbineIcon, oilgasIcon, havvindIcon } from "./energy-map-helpers";

// ─── Cabin icon ──────────────────────────────────────────────

export type CabinType = "fjellhytte" | "ubetjent";

export const CABIN_COLORS: Record<CabinType, string> = {
  fjellhytte: "#b91c1c",
  ubetjent: "#15803d",
};

const cabinIconCache = new Map<string, L.DivIcon>();

export function cabinIcon(
  type: CabinType,
  isSelected: boolean,
  inverted: boolean
): L.DivIcon {
  const key = `${type}-${isSelected}-${inverted}`;
  const cached = cabinIconCache.get(key);
  if (cached) return cached;

  const baseColor = isSelected ? "#24374c" : CABIN_COLORS[type];
  const size = type === "fjellhytte" ? 30 : 26;
  const filled = type === "fjellhytte";
  const bg = inverted ? baseColor : "white";
  const iconColor = inverted ? "white" : baseColor;
  const border = isSelected
    ? "#24374c"
    : inverted
      ? "rgba(255,255,255,0.3)"
      : "rgba(0,0,0,0.15)";

  const housePath = filled
    ? `<path d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1H4a1 1 0 01-1-1z" fill="${iconColor}" stroke="${iconColor}" stroke-width="1.5"/>`
    : `<path d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1H4a1 1 0 01-1-1z" fill="none" stroke="${iconColor}" stroke-width="2"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 1 24 24" width="${size * 0.5}" height="${size * 0.5}">${housePath}</svg>`;

  const icon = L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;line-height:0;background:${bg};border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.25);border:2.5px solid ${border}">${svg}</div>`,
  });
  cabinIconCache.set(key, icon);
  return icon;
}

// ─── Charging icon ───────────────────────────────────────────

const chargingIconCache = new Map<string, L.DivIcon>();

export function chargingIcon(
  isSelected: boolean,
  inverted: boolean
): L.DivIcon {
  const key = `${isSelected}-${inverted}`;
  const cached = chargingIconCache.get(key);
  if (cached) return cached;

  const size = 28;
  const bg = inverted ? (isSelected ? "#24374c" : "#15803d") : "white";
  const iconColor = inverted ? "white" : isSelected ? "#24374c" : "#15803d";
  const border = isSelected
    ? "#24374c"
    : inverted
      ? "rgba(255,255,255,0.3)"
      : "rgba(0,0,0,0.15)";
  const bolt = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="${iconColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`;

  const icon = L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;line-height:0;background:${bg};border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.25);border:2.5px solid ${border}">${bolt}</div>`,
  });
  chargingIconCache.set(key, icon);
  return icon;
}

// ─── School icon ─────────────────────────────────────────────

export type SchoolType = "grunnskole" | "vgs" | "begge";

const schoolIconCache = new Map<string, L.DivIcon>();

export function schoolIcon(
  type: SchoolType,
  isSelected: boolean,
  inverted: boolean
): L.DivIcon {
  const key = `${type}-${isSelected}-${inverted}`;
  const cached = schoolIconCache.get(key);
  if (cached) return cached;

  // Slightly bigger for VGS (taller buildings, older students)
  const size = type === "vgs" ? 30 : type === "begge" ? 30 : 26;
  const color = "#6d28d9"; // purple-700
  const bg = inverted ? (isSelected ? "#24374c" : color) : "white";
  const iconColor = inverted ? "white" : isSelected ? "#24374c" : color;
  const border = isSelected
    ? "#24374c"
    : inverted
      ? "rgba(255,255,255,0.3)"
      : "rgba(0,0,0,0.15)";
  const cap = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>`;

  const icon = L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;line-height:0;background:${bg};border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.25);border:2.5px solid ${border}">${cap}</div>`,
  });
  schoolIconCache.set(key, icon);
  return icon;
}

// ─── Kindergarten icon ───────────────────────────────────────

const kindergartenIconCache = new Map<string, L.DivIcon>();

export function kindergartenIcon(
  isSelected: boolean,
  inverted: boolean
): L.DivIcon {
  const key = `${isSelected}-${inverted}`;
  const cached = kindergartenIconCache.get(key);
  if (cached) return cached;

  const size = 24;
  const color = "#c2410c"; // orange-700
  const bg = inverted ? (isSelected ? "#24374c" : color) : "white";
  const iconColor = inverted ? "white" : isSelected ? "#24374c" : color;
  const border = isSelected
    ? "#24374c"
    : inverted
      ? "rgba(255,255,255,0.3)"
      : "rgba(0,0,0,0.15)";
  // Lucide 'baby' path
  const baby = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12h.01"/><path d="M15 12h.01"/><path d="M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5"/><path d="M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1"/></svg>`;

  const icon = L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;line-height:0;background:${bg};border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.25);border:2.5px solid ${border}">${baby}</div>`,
  });
  kindergartenIconCache.set(key, icon);
  return icon;
}

// ─── Reservoir icon ──────────────────────────────────────────

const reservoirIconCache = new Map<string, L.DivIcon>();

export function reservoirIcon(
  isSelected: boolean,
  inverted: boolean
): L.DivIcon {
  const key = `${isSelected}-${inverted}`;
  const cached = reservoirIconCache.get(key);
  if (cached) return cached;

  const size = 26;
  const color = "#0891b2"; // cyan-600
  const bg = inverted ? (isSelected ? "#24374c" : color) : "white";
  const iconColor = inverted ? "white" : isSelected ? "#24374c" : color;
  const border = isSelected
    ? "#24374c"
    : inverted
      ? "rgba(255,255,255,0.3)"
      : "rgba(0,0,0,0.15)";
  // Water droplet icon (lucide droplets)
  const drop = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>`;

  const icon = L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;line-height:0;background:${bg};border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.25);border:2.5px solid ${border}">${drop}</div>`,
  });
  reservoirIconCache.set(key, icon);
  return icon;
}
