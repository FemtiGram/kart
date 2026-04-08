export async function GET() {
  const res = await fetch("https://data.ssb.no/api/v0/no/table/06035", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: [
        { code: "Region", selection: { filter: "all", values: ["*"] } },
        { code: "Boligtype", selection: { filter: "item", values: ["01", "02", "03"] } },
        { code: "ContentsCode", selection: { filter: "item", values: ["KvPris", "Omsetninger"] } },
        { code: "Tid", selection: { filter: "item", values: ["2015", "2016", "2017", "2018", "2019", "2020", "2021", "2022", "2023", "2024"] } },
      ],
      response: { format: "json-stat2" },
    }),
    next: { revalidate: 86400 },
  });

  if (!res.ok) return Response.json({ error: "SSB fetch failed" }, { status: res.status });

  const data = await res.json();

  const ids: string[] = data.id;
  const sizes: number[] = data.size;
  const values: (number | null)[] = data.value;

  // Generic stride calculation for any dimension ordering
  const strides = new Array(ids.length).fill(1);
  for (let i = ids.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * sizes[i + 1];
  }

  const regionIndex = data.dimension.Region.category.index as Record<string, number>;
  const typeIndex = data.dimension.Boligtype.category.index as Record<string, number>;
  const contentsIndex = data.dimension.ContentsCode.category.index as Record<string, number>;
  const tidIndex = data.dimension.Tid.category.index as Record<string, number>;

  const rStride = strides[ids.indexOf("Region")];
  const bStride = strides[ids.indexOf("Boligtype")];
  const cStride = strides[ids.indexOf("ContentsCode")];
  const tStride = strides[ids.indexOf("Tid")];

  const priceIdx = contentsIndex["KvPris"];
  const countIdx = contentsIndex["Omsetninger"];

  // Build nested result: { kommunenummer: { boligtype: { year: { price, count } } } }
  const result: Record<string, Record<string, Record<string, { price: number | null; count: number | null }>>> = {};

  for (const [kommune, rI] of Object.entries(regionIndex)) {
    if (!/^\d{4}$/.test(kommune)) continue;

    const types: Record<string, Record<string, { price: number | null; count: number | null }>> = {};
    let hasAny = false;

    for (const [typeCode, bI] of Object.entries(typeIndex)) {
      const years: Record<string, { price: number | null; count: number | null }> = {};

      for (const [year, tI] of Object.entries(tidIndex)) {
        const base = rI * rStride + bI * bStride + tI * tStride;
        const price = values[base + priceIdx * cStride] ?? null;
        const count = values[base + countIdx * cStride] ?? null;
        if (price !== null || count !== null) {
          years[year] = { price, count };
          hasAny = true;
        }
      }

      if (Object.keys(years).length > 0) {
        types[typeCode] = years;
      }
    }

    if (hasAny) {
      result[kommune] = types;
    }
  }

  // Also return the years and type labels for the client
  const typeLabels: Record<string, string> = {};
  const typeLabel = data.dimension.Boligtype.category.label as Record<string, string>;
  for (const [code, label] of Object.entries(typeLabel)) {
    typeLabels[code] = label as string;
  }

  const years = Object.keys(tidIndex).sort();

  return Response.json({ data: result, years, typeLabels });
}
