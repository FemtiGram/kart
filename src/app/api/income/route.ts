export async function GET() {
  const res = await fetch("https://data.ssb.no/api/v0/no/table/InntektStruk13", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: [
        { code: "Region", selection: { filter: "all", values: ["*"] } },
        { code: "HusholdType", selection: { filter: "item", values: ["0000"] } },
        { code: "ContentsCode", selection: { filter: "item", values: ["InntSkatt"] } },
        { code: "Tid", selection: { filter: "item", values: ["2024"] } },
      ],
      response: { format: "json-stat2" },
    }),
    next: { revalidate: 86400 }, // 24h cache
  });

  if (!res.ok) {
    return Response.json({ error: "SSB fetch failed" }, { status: res.status });
  }

  const data = await res.json();

  // Parse JSON-stat2: dimension.Region.category.index maps kommunenummer → position in values array
  const regionIndex = data.dimension.Region.category.index as Record<string, number>;
  const values = data.value as (number | null)[];

  // Filter to 4-digit municipality codes only (excludes county-level codes)
  const income: Record<string, number> = {};
  for (const [code, idx] of Object.entries(regionIndex)) {
    if (/^\d{4}$/.test(code) && values[idx] != null) {
      income[code] = values[idx] as number;
    }
  }

  return Response.json(income);
}
