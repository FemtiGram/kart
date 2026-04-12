"use client";

import { MapContainer, TileLayer, Polygon, useMap } from "react-leaflet";
import { useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Props {
  /** Simplified outline as [lat, lon] rings. */
  outline: Array<Array<[number, number]>>;
  /** [minLat, minLon, maxLat, maxLon] */
  bbox: [number, number, number, number];
  name: string;
}

function FitBounds({ bbox }: { bbox: [number, number, number, number] }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLngBounds(
      [bbox[0], bbox[1]],
      [bbox[2], bbox[3]]
    );
    map.fitBounds(bounds, { padding: [20, 20], animate: false });
  }, [bbox, map]);
  return null;
}

export function KommuneMiniMap({ outline, bbox, name }: Props) {
  if (outline.length === 0) return null;

  return (
    <div
      className="rounded-2xl overflow-hidden border"
      style={{ height: 320 }}
    >
      <MapContainer
        center={[(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]}
        zoom={9}
        zoomControl={false}
        scrollWheelZoom={false}
        dragging={false}
        doubleClickZoom={false}
        touchZoom={false}
        keyboard={false}
        attributionControl={false}
        style={{ width: "100%", height: "100%", background: "#eae8e3" }}
      >
        <TileLayer
          url="https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png"
          attribution='&copy; <a href="https://www.kartverket.no/">Kartverket</a>'
          maxZoom={17}
        />
        <Polygon
          positions={outline}
          pathOptions={{
            color: "#24374c",
            weight: 2.5,
            fillColor: "#24374c",
            fillOpacity: 0.18,
          }}
        />
        <FitBounds bbox={bbox} />
      </MapContainer>
      <span className="sr-only">Kart av {name}</span>
    </div>
  );
}
