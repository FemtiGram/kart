import { ImageResponse } from "next/og";

export const alt = "Prisutvikling-kalkulator — Datakart";
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
        <span
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "rgba(255,255,255,0.5)",
            letterSpacing: 1,
          }}
        >
          DATAKART
        </span>
        <span
          style={{
            fontSize: 64,
            fontWeight: 800,
            color: "white",
            marginTop: 8,
            lineHeight: 1.05,
          }}
        >
          Prisutvikling-kalkulator
        </span>
        <p
          style={{
            fontSize: 28,
            color: "rgba(255,255,255,0.7)",
            marginTop: 16,
            maxWidth: 900,
          }}
        >
          Hvordan har boligprisen utviklet seg siden du kjøpte? Basert på SSBs kvadratmeterpriser.
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "20px",
            marginTop: 48,
          }}
        >
          <span
            style={{
              fontSize: 28,
              color: "rgba(255,255,255,0.6)",
              fontWeight: 600,
            }}
          >
            3 000 000 kr i 2018
          </span>
          <span style={{ fontSize: 28, color: "rgba(255,255,255,0.4)" }}>→</span>
          <span
            style={{
              fontSize: 56,
              fontWeight: 800,
              color: "white",
            }}
          >
            ≈ 4 020 000 kr
          </span>
        </div>
        <div
          style={{
            display: "flex",
            gap: "16px",
            marginTop: 36,
          }}
        >
          {["Enebolig", "Småhus", "Blokk", "2002–2024"].map((label) => (
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
