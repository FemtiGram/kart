import { ImageResponse } from "next/og";

export const alt = "Datakart — Utforsk norske geodata";
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
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 32 32"
            width="72"
            height="72"
          >
            <rect width="32" height="32" rx="7" fill="white" />
            <g
              transform="translate(5, 5) scale(0.9375)"
              stroke="#24374c"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              fill="none"
            >
              <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
              <line x1="9" x2="9" y1="3" y2="18" />
              <line x1="15" x2="15" y1="6" y2="21" />
            </g>
          </svg>
          <span style={{ fontSize: 64, fontWeight: 800, color: "white" }}>
            Datakart
          </span>
        </div>
        <p style={{ fontSize: 28, color: "rgba(255,255,255,0.7)", marginTop: 24 }}>
          Utforsk norske geodata — høyder, inntekt, verneområder og ladestasjoner
        </p>
        <div
          style={{
            display: "flex",
            gap: "12px",
            marginTop: 40,
          }}
        >
          {["Høydekart", "Inntektskart", "Verneområder", "Ladestasjoner"].map(
            (label) => (
              <div
                key={label}
                style={{
                  padding: "10px 24px",
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.15)",
                  border: "1px solid rgba(255,255,255,0.25)",
                  color: "white",
                  fontSize: 20,
                  fontWeight: 600,
                }}
              >
                {label}
              </div>
            )
          )}
        </div>
      </div>
    ),
    { ...size }
  );
}
