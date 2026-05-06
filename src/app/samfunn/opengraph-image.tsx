import { ImageResponse } from "next/og";

export const alt = "Samfunn i Norge — Datakart";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #24374c 0%, #0f1923 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <span style={{ fontSize: 24, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: 1 }}>
          DATAKART · KATEGORI
        </span>
        <span style={{ fontSize: 96, fontWeight: 800, color: "white", marginTop: 8 }}>
          Samfunn
        </span>
        <p style={{ fontSize: 28, color: "rgba(255,255,255,0.7)", marginTop: 16, maxWidth: 900 }}>
          Bolig, inntekt, helse, skoler, valg og 357 stedsprofiler — kommune for kommune
        </p>
        <div style={{ display: "flex", gap: "16px", marginTop: 40, flexWrap: "wrap" }}>
          {["Stedsprofil", "Boligpriser", "Valgkart", "Helsetilbud"].map((label) => (
            <div
              key={label}
              style={{
                padding: "10px 24px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.15)",
                border: "1px solid rgba(255,255,255,0.25)",
                color: "white",
                fontSize: 18,
                fontWeight: 600,
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
