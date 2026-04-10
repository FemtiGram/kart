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
    cache: "no-store",
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
        if (price !== null) {
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

  // Merge old kommune codes into new codes (2020 municipal reform)
  // Old codes have labels like "Asker (-2019)", "Songdalen (1964-2019)", "Holmestrand (2018-2019)"
  const regionLabels = data.dimension.Region.category.label as Record<string, string>;
  const isOldCode = (label: string) => /\(\d{0,4}-?\d{4}\)/.test(label);
  const newCodeByName = new Map<string, string>();
  for (const [code, label] of Object.entries(regionLabels)) {
    if (!/^\d{4}$/.test(code)) continue;
    const str = String(label);
    if (isOldCode(str)) continue; // Skip old codes
    // Current code — index by clean name
    // Use " - " (space-dash-space) to strip Sami suffixes: "Oslo - Oslove" → "Oslo"
    // But preserve hyphens in names: "Aurskog-Høland" stays "Aurskog-Høland"
    const name = str.replace(/\s+-\s+.*$/, "").trim();
    newCodeByName.set(name, code);
  }

  const merged: string[] = []; // kommuner with data from old boundaries
  for (const [oldCode, label] of Object.entries(regionLabels)) {
    if (!/^\d{4}$/.test(oldCode)) continue;
    const str = String(label);
    if (!isOldCode(str)) continue;
    // Extract base name: "Asker (-2019)" → "Asker", "Aurskog-Høland (1966-2019)" → "Aurskog-Høland"
    const baseName = str.replace(/\s*\(.*\)/, "").trim();
    const newCode = newCodeByName.get(baseName);
    if (!newCode || !result[oldCode]) continue;
    // Merge old data into new code (old years only — don't overwrite new data)
    if (!result[newCode]) result[newCode] = {};
    for (const [typeCode, years] of Object.entries(result[oldCode])) {
      if (!result[newCode][typeCode]) result[newCode][typeCode] = {};
      for (const [year, entry] of Object.entries(years)) {
        if (!result[newCode][typeCode][year]) {
          result[newCode][typeCode][year] = entry;
        }
      }
    }
    merged.push(newCode);
    delete result[oldCode]; // Remove old code from output
  }

  // Also return the years and type labels for the client
  const typeLabels: Record<string, string> = {};
  const typeLabel = data.dimension.Boligtype.category.label as Record<string, string>;
  for (const [code, label] of Object.entries(typeLabel)) {
    typeLabels[code] = label as string;
  }

  const years = Object.keys(tidIndex).sort();

  return Response.json({ data: result, years, typeLabels, merged: [...new Set(merged)] });
}
