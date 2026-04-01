export async function GET() {
  const res = await fetch(
    "https://data.ssb.no/api/pxwebapi/v2/tables/08936/data?lang=en&outputFormat=json-stat2&valuecodes[ContentsCode]=VernetAreal&valuecodes[Tid]=2024&valuecodes[Region]=*&codelist[Region]=agg_KommGjeldende&valuecodes[VerneOmrader]=*&heading=ContentsCode,Tid,VerneOmrader&stub=Region",
    { next: { revalidate: 86400 } }
  );

  if (!res.ok) return Response.json({ error: "SSB fetch failed" }, { status: res.status });

  const data = await res.json();

  const regionIndex = data.dimension.Region.category.index as Record<string, number>;
  const verneIndex = data.dimension.VerneOmrader.category.index as Record<string, number>;
  const ids: string[] = data.id;
  const sizes: number[] = data.size;
  const values: (number | null)[] = data.value;

  // Generic stride calculation for any dimension ordering
  const strides = new Array(ids.length).fill(1);
  for (let i = ids.length - 2; i >= 0; i--) {
    strides[i] = strides[i + 1] * sizes[i + 1];
  }
  const rStride = strides[ids.indexOf("Region")];
  const vStride = strides[ids.indexOf("VerneOmrader")];

  const result: Record<string, { total: number | null; np: number | null; nr: number | null; lv: number | null; nm: number | null }> = {};

  for (const [kommunenummer, rIdx] of Object.entries(regionIndex)) {
    const get = (code: string): number | null => {
      const vIdx = verneIndex[code];
      if (vIdx === undefined) return null;
      return values[rIdx * rStride + vIdx * vStride] ?? null;
    };
    result[kommunenummer] = {
      total: get("0"),
      np: get("NP"),
      nr: get("NR"),
      lv: get("LV"),
      nm: get("NM"),
    };
  }

  return Response.json(result);
}
