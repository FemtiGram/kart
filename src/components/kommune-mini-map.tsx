"use client";

import { MapContainer, TileLayer, Polygon, CircleMarker, Tooltip, useMap } from "react-leaflet";
import { useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Marker {
  lat: number;
  lon: number;
  name: string;
  kind: "energy" | "cabin" | "reservoir";
  detail?: string;
}

interface Props {
  /** Simplified outline as [lat, lon] rings. */
  outline: Array<Array<[number, number]>>;
  /** [minLat, minLon, maxLat, maxLon] */
  bbox: [number, number, number, number];
  name: string;
  markers?: Marker[];
}

function FitBounds({ bbox }: { bbox: [number, number, number, number] }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLngBounds([bbox[0], bbox[1]], [bbox[2], bbox[3]]);
    map.fitBounds(bounds, { padding: [24, 24], animate: false });
  }, [bbox, map]);
  return null;
}

const MARKER_STYLES: Record<Marker["kind"], { color: string; fillColor: string }> = {
  energy: { color: "#1e3a5f", fillColor: "#3b82f6" },
  cabin: { color: "#78350f", fillColor: "#d97706" },
  reservoir: { color: "#0c4a6e", fillColor: "#0891b2" },
};

export function KommuneMiniMap({ outline, bbox, name, markers = [] }: Props) {
  if (outline.length === 0) return null;

  return (
    <div
      className="rounded-2xl overflow-hidden border"
      style={{ height: 380 }}
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
          url="https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png"
          attribution='&copy; <a href="https://www.kartverket.no/">Kartverket</a>'
          maxZoom={17}
        />
        <Polygon
          positions={outline}
          pathOptions={{
            color: "#24374c",
            weight: 2.5,
            fillColor: "#24374c",
            fillOpacity: 0.15,
          }}
        />
        {markers.map((m, i) => {
          const style = MARKER_STYLES[m.kind];
          return (
            <CircleMarker
              key={`${m.kind}-${i}`}
              center={[m.lat, m.lon]}
              radius={6}
              pathOptions={{
                color: style.color,
                fillColor: style.fillColor,
                fillOpacity: 0.9,
                weight: 2,
              }}
            >
              <Tooltip direction="top" offset={[0, -4]} opacity={1}>
                <div className="text-xs">
                  <div className="font-semibold">{m.name}</div>
                  {m.detail && <div className="text-foreground/70">{m.detail}</div>}
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
        <FitBounds bbox={bbox} />
      </MapContainer>
      <span className="sr-only">Kart av {name}</span>
    </div>
  );
}
