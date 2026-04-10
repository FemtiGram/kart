const SSB_BASE = "https://data.ssb.no/api/v0/no/table";

interface CategoryData {
  code: string;
  name: string;
  change12m: number | null;
  change1m: number | null;
}

interface TrendPoint {
  month: string;
  total: number | null;
  jae: number | null;
  rate: number | null;
}

export async function GET() {
  try {
    // Fetch all data sources in parallel
    const [kpiRes, jaeRes, rateRes, nordicRes, yearlyRes] = await Promise.all([
      // SSB 03013: Monthly KPI — last 25 months, all categories, 12-month + 1-month change
      fetch(`${SSB_BASE}/03013`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: [
            { code: "Konsumgrp", selection: { filter: "item", values: ["TOTAL", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"] } },
            { code: "ContentsCode", selection: { filter: "item", values: ["Tolvmanedersendring", "Manedsendring"] } },
            { code: "Tid", selection: { filter: "top", values: ["25"] } },
          ],
          response: { format: "json-stat2" },
        }),
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(8000),
      }),
      // SSB 05327: KPI-JAE — last 25 months
      fetch(`${SSB_BASE}/05327`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: [
            { code: "Konsumgrp", selection: { filter: "item", values: ["JAE_TOTAL"] } },
            { code: "ContentsCode", selection: { filter: "item", values: ["Tolvmanedersendring"] } },
            { code: "Tid", selection: { filter: "top", values: ["25"] } },
          ],
          response: { format: "json-stat2" },
        }),
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(8000),
      }),
      // Norges Bank: Policy rate — monthly, last 25
      fetch("https://data.norges-bank.no/api/data/IR/M..SD?format=sdmx-json&lastNObservations=25", {
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(8000),
      }).catch(() => null),
      // Eurostat: HICP for Nordics — last 1 observation
      fetch("https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/PRC_HICP_MANR/M.RCH_A.CP00.NO+SE+DK+FI+EU27_2020?format=JSON&lastNObservations=1", {
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(8000),
      }).catch(() => null),
      // SSB 03014: Yearly KPI — last 20 years
      fetch(`${SSB_BASE}/03014`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: [
            { code: "Konsumgrp", selection: { filter: "item", values: ["TOTAL"] } },
            { code: "ContentsCode", selection: { filter: "item", values: ["Aarsendring"] } },
            { code: "Tid", selection: { filter: "top", values: ["20"] } },
          ],
          response: { format: "json-stat2" },
        }),
        next: { revalidate: 3600 },
        signal: AbortSignal.timeout(8000),
      }),
    ]);

    if (!kpiRes.ok) return Response.json({ error: "SSB KPI fetch failed" }, { status: 500 });

    // Parse SSB 03013 (monthly KPI)
    const kpi = await kpiRes.json();
    const kIds = kpi.id as string[];
    const kSizes = kpi.size as number[];
    const kVals = kpi.value as (number | null)[];
    const kStrides = new Array(kIds.length).fill(1);
    for (let i = kIds.length - 2; i >= 0; i--) kStrides[i] = kStrides[i + 1] * kSizes[i + 1];
    const kGrpIdx = kpi.dimension.Konsumgrp.category.index as Record<string, number>;
    const kGrpLabels = kpi.dimension.Konsumgrp.category.label as Record<string, string>;
    const kContIdx = kpi.dimension.ContentsCode.category.index as Record<string, number>;
    const kTidIdx = kpi.dimension.Tid.category.index as Record<string, number>;
    const kGrpS = kStrides[kIds.indexOf("Konsumgrp")];
    const kContS = kStrides[kIds.indexOf("ContentsCode")];
    const kTidS = kStrides[kIds.indexOf("Tid")];
    const twelveMIdx = kContIdx["Tolvmanedersendring"];
    const oneMIdx = kContIdx["Manedsendring"];

    const months = Object.keys(kTidIdx).sort();
    const latestMonth = months[months.length - 1];

    // Build categories (latest month)
    const latestTi = kTidIdx[latestMonth];
    const categories: CategoryData[] = [];
    for (const [code, gi] of Object.entries(kGrpIdx)) {
      if (code === "TOTAL") continue;
      categories.push({
        code,
        name: kGrpLabels[code],
        change12m: kVals[gi * kGrpS + twelveMIdx * kContS + latestTi * kTidS] ?? null,
        change1m: kVals[gi * kGrpS + oneMIdx * kContS + latestTi * kTidS] ?? null,
      });
    }
    categories.sort((a, b) => (b.change12m ?? 0) - (a.change12m ?? 0));

    const totalChange12m = kVals[kGrpIdx["TOTAL"] * kGrpS + twelveMIdx * kContS + latestTi * kTidS] ?? null;
    const totalChange1m = kVals[kGrpIdx["TOTAL"] * kGrpS + oneMIdx * kContS + latestTi * kTidS] ?? null;

    // Build trend (total KPI 12-month change per month)
    const trend: TrendPoint[] = [];
    for (const m of months) {
      const ti = kTidIdx[m];
      trend.push({
        month: m,
        total: kVals[kGrpIdx["TOTAL"] * kGrpS + twelveMIdx * kContS + ti * kTidS] ?? null,
        jae: null,
        rate: null,
      });
    }

    // Parse SSB 05327 (KPI-JAE)
    let jaeLatest: number | null = null;
    if (jaeRes.ok) {
      const jae = await jaeRes.json();
      const jVals = jae.value as (number | null)[];
      const jTidIdx = jae.dimension.Tid.category.index as Record<string, number>;
      const jMonths = Object.keys(jTidIdx).sort();
      jaeLatest = jVals[jVals.length - 1];
      // Merge JAE into trend
      for (const m of jMonths) {
        const ti = jTidIdx[m];
        const trendPoint = trend.find((t) => t.month === m);
        if (trendPoint) trendPoint.jae = jVals[ti] ?? null;
      }
    }

    // Parse Norges Bank rate
    let rateLatest: number | null = null;
    if (rateRes?.ok) {
      try {
        const rate = await rateRes.json();
        const series = Object.values(rate.data.dataSets[0].series)[0] as { observations: Record<string, string[]> };
        const timeDim = rate.data.structure.dimensions.observation[0].values as { id: string; name: string }[];
        for (const [i, v] of Object.entries(series.observations)) {
          const period = timeDim[parseInt(i)];
          if (!period) continue;
          const val = parseFloat(v[0]);
          rateLatest = val;
          // Match to trend by period name (e.g. "2025-11" → "2025M11")
          const trendMonth = period.id.replace("-", "M");
          const trendPoint = trend.find((t) => t.month === trendMonth);
          if (trendPoint) trendPoint.rate = val;
        }
      } catch { /* ignore parse errors */ }
    }

    // Parse Eurostat (Nordic comparison)
    const nordic: Record<string, number | null> = { NO: null, SE: null, DK: null, FI: null, EU: null };
    if (nordicRes?.ok) {
      try {
        const eu = await nordicRes.json();
        const geoIdx = eu.dimension.geo.category.index as Record<string, number>;
        const euVals = eu.value as Record<string, number>;
        // Eurostat indexes values by flat position
        const geoCount = Object.keys(geoIdx).length;
        const timeCount = Object.keys(eu.dimension.time.category.index).length;
        // Last observation for each country
        for (const [geo, gi] of Object.entries(geoIdx)) {
          const lastIdx = gi * timeCount + (timeCount - 1);
          const key = geo === "EU27_2020" ? "EU" : geo;
          if (key in nordic) nordic[key] = euVals[String(lastIdx)] ?? null;
        }
      } catch { /* ignore */ }
    }

    // Parse SSB 03014 (yearly)
    const yearly: { year: string; change: number | null }[] = [];
    if (yearlyRes.ok) {
      const yr = await yearlyRes.json();
      const yVals = yr.value as (number | null)[];
      const yTidIdx = yr.dimension.Tid.category.index as Record<string, number>;
      for (const [year, ti] of Object.entries(yTidIdx)) {
        yearly.push({ year, change: yVals[ti as number] ?? null });
      }
      yearly.sort((a, b) => a.year.localeCompare(b.year));
    }

    // Format month for display: "2025M12" → "desember 2025"
    const monthNames = ["januar", "februar", "mars", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "desember"];
    const [y, m] = latestMonth.split("M");
    const monthLabel = `${monthNames[parseInt(m) - 1]} ${y}`;

    return Response.json({
      current: {
        total: totalChange12m,
        total1m: totalChange1m,
        jae: jaeLatest,
        rate: rateLatest,
        month: monthLabel,
        monthCode: latestMonth,
      },
      categories,
      trend,
      nordic,
      yearly,
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
