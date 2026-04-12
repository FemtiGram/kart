import { ImageResponse } from "next/og";
import { getProfileBySlug } from "@/lib/kommune-profiles";

export const alt = "Stedsprofil — Datakart";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function fmt(n: number | null | undefined): string {
  if (n == null) return "–";
  return new Intl.NumberFormat("nb-NO").format(Math.round(n));
}

export default async function OgImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const profile = getProfileBySlug(slug);

  // Fallback for unknown slugs (should not happen after generateStaticParams,
  // but Next.js may call this for arbitrary URLs during development).
  if (!profile) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #24374c 0%, #0f1923 100%)",
            color: "white",
            fontSize: 48,
            fontWeight: 800,
            fontFamily: "sans-serif",
          }}
        >
          Datakart
        </div>
      ),
      { ...size }
    );
  }

  const blokk = profile.bolig["03"]?.price ?? null;
  const incomeDisplay = profile.income ? `${fmt(profile.income)} kr` : null;
  const blokkDisplay = blokk ? `${fmt(blokk)} kr/m²` : null;
  const mwDisplay = profile.energy.totalMW > 0 ? `${fmt(profile.energy.totalMW)} MW` : null;

  const stats: Array<{ label: string; value: string }> = [];
  if (profile.population != null) {
    stats.push({ label: "Innbyggere", value: fmt(profile.population) });
  }
  if (incomeDisplay) stats.push({ label: "Median inntekt", value: incomeDisplay });
  if (blokkDisplay) stats.push({ label: "Blokkleilighet", value: blokkDisplay });
  if (mwDisplay && stats.length < 3) stats.push({ label: "Installert", value: mwDisplay });

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
          DATAKART · STEDSPROFIL
        </span>
        <span
          style={{
            fontSize: 96,
            fontWeight: 800,
            color: "white",
            marginTop: 8,
            lineHeight: 1,
          }}
        >
          {profile.displayName}
        </span>
        {profile.fylke && (
          <p
            style={{
              fontSize: 28,
              color: "rgba(255,255,255,0.7)",
              marginTop: 12,
            }}
          >
            {profile.fylke} fylke · {fmt(profile.area)} km²
          </p>
        )}
        <div
          style={{
            display: "flex",
            gap: "24px",
            marginTop: 56,
          }}
        >
          {stats.slice(0, 3).map((s) => (
            <div
              key={s.label}
              style={{
                display: "flex",
                flexDirection: "column",
                padding: "20px 28px",
                borderRadius: 16,
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.2)",
                minWidth: 240,
              }}
            >
              <span
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.6)",
                  textTransform: "uppercase",
                  letterSpacing: 1,
                }}
              >
                {s.label}
              </span>
              <span
                style={{
                  fontSize: 36,
                  fontWeight: 800,
                  color: "white",
                  marginTop: 4,
                }}
              >
                {s.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
