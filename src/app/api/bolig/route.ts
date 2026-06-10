// SSB split the kvadratmeterpris series in 2025:
//   06035 — Selveierboliger 2002–2024 (avslutta serie, discontinued Jan 2025)
//   14545 — successor annual table, 2025 onwards (same structure: Region/Boligtype/ContentsCode/Tid)
// We fetch both and merge so the full 2002–present timeline stays intact and new
// years appear automatically as SSB publishes them into 14545.
const TABLES = ["06035", "14545"];

type Entry = { price: number | null; count: number | null };
type Result = Record<string, Record<string, Record<string, Entry>>>;

async function fetchTable(table: string) {
  const res = await fetch(`https://data.ssb.no/api/v0/no/table/${table}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: [
        { code: "Region", selection: { filter: "all", values: ["*"] } },
        { code: "Boligtype", selection: { filter: "item", values: ["01", "02", "03"] } },
        { code: "ContentsCode", selection: { filter: "item", values: ["KvPris", "Omsetninger"] } },
        { code: "Tid", selection: { filter: "all", values: ["*"] } },
      ],
      response: { format: "json-stat2" },
    }),
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;
  return res.json();
}

// Parse one json-stat2 table into the nested result shape, collapsing pre-2020
// kommune codes into their current code (2020 municipal reform).
function buildResult(data: {
  id: string[];
  size: number[];
  value: (number | null)[];
  dimension: Record<string, { category: { index: Record<string, number>; label: Record<string, string> } }>;
}): { result: Result; merged: string[]; years: string[]; typeLabels: Record<string, string> } {
  const ids = data.id;
  const sizes = data.size;
  const values = data.value;

  // Generic stride calculation for any dimension ordering
  const strides = new Array(ids.length).fill(1);
  for (let i = ids.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * sizes[i + 1];
  }

  const regionIndex = data.dimension.Region.category.index;
  const typeIndex = data.dimension.Boligtype.category.index;
  const contentsIndex = data.dimension.ContentsCode.category.index;
  const tidIndex = data.dimension.Tid.category.index;

  const rStride = strides[ids.indexOf("Region")];
  const bStride = strides[ids.indexOf("Boligtype")];
  const cStride = strides[ids.indexOf("ContentsCode")];
  const tStride = strides[ids.indexOf("Tid")];

  const priceIdx = contentsIndex["KvPris"];
  const countIdx = contentsIndex["Omsetninger"];

  // Build nested result: { kommunenummer: { boligtype: { year: { price, count } } } }
  const result: Result = {};

  for (const [kommune, rI] of Object.entries(regionIndex)) {
    if (!/^\d{4}$/.test(kommune)) continue;

    const types: Record<string, Record<string, Entry>> = {};
    let hasAny = false;

    for (const [typeCode, bI] of Object.entries(typeIndex)) {
      const years: Record<string, Entry> = {};

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
  const regionLabels = data.dimension.Region.category.label;
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

  const typeLabels: Record<string, string> = {};
  for (const [code, label] of Object.entries(data.dimension.Boligtype.category.label)) {
    typeLabels[code] = label as string;
  }

  const years = Object.keys(tidIndex).sort();

  return { result, merged, years, typeLabels };
}

export async function GET() {
  const tables = await Promise.all(TABLES.map(fetchTable));
  if (tables.every((t) => t === null)) {
    return Response.json({ error: "SSB fetch failed" }, { status: 502 });
  }

  // Merge per-table results. Years never overlap between tables (06035 ≤ 2024,
  // 14545 ≥ 2025), so Object.assign on the year map is safe.
  const data: Result = {};
  const mergedSet = new Set<string>();
  const yearSet = new Set<string>();
  const typeLabels: Record<string, string> = {};

  for (const raw of tables) {
    if (!raw) continue;
    const b = buildResult(raw);
    for (const [kommune, types] of Object.entries(b.result)) {
      const dst = (data[kommune] ??= {});
      for (const [typeCode, years] of Object.entries(types)) {
        Object.assign((dst[typeCode] ??= {}), years);
      }
    }
    b.merged.forEach((m) => mergedSet.add(m));
    b.years.forEach((y) => yearSet.add(y));
    Object.assign(typeLabels, b.typeLabels);
  }

  const years = [...yearSet].sort();

  return Response.json({ data, years, typeLabels, merged: [...mergedSet] });
}
