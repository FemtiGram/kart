import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

// Minimal ArcGIS-shaped fixtures. Coordinates are UTM zone 33N near Oslo.
const WIND_LAYER = {
  features: [
    {
      geometry: { x: 262000, y: 6650000 },
      attributes: { objectid: 1, anleggnavn: "Testvind", eier: "Testeier", effekt_mw_idrift: 10, antallturbiner: 5 },
    },
  ],
};

const HYDRO_LAYER = {
  features: [
    {
      geometry: { x: 262000, y: 6650000 },
      attributes: { objectid: 2, status: "D", vannkraftverknavn: "Testvann", maksytelse_mw: 50 },
    },
  ],
};

const TURBINE_LAYER = {
  features: [{ geometry: { x: 262100, y: 6650100 }, attributes: { objectid: 7, anleggnavn: "Testvind" } }],
};

const SODIR_LAYER = {
  features: [
    {
      attributes: {
        OBJECTID: 3,
        fclName: "Testplattform",
        fclNationCode2: "NO",
        fclNsDeg: 60,
        fclNsMin: 30,
        fclNsSec: 0,
        fclEwDeg: 2,
        fclEwMin: 15,
        fclEwSec: 0,
        fclEwCode: "E",
        fclKind: "CONCRETE STRUCTURE",
        fclPhase: "IN SERVICE",
        fclSurface: "Y",
      },
    },
  ],
};

const PIPELINE_LAYER = {
  features: [
    {
      geometry: { paths: [[[2, 60], [3, 61]]] },
      attributes: { OBJECTID: 4, pplName: "Testrør" },
    },
  ],
};

const EMPTY_LAYER = { features: [] };

function ok(data: unknown) {
  return Promise.resolve(new Response(JSON.stringify(data)));
}

function timeout(): Promise<Response> {
  return Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
}

/** Route fetches to fixtures by URL substring; unmatched URLs get `fallback`. */
function mockFetch(overrides: Record<string, () => Promise<Response>> = {}) {
  const routes: Record<string, () => Promise<Response>> = {
    "Vindkraft2/MapServer/0/": () => ok(WIND_LAYER),
    "Vindkraft2/MapServer/1/": () => ok(EMPTY_LAYER),
    "Vindkraft2/MapServer/2/": () => ok(EMPTY_LAYER),
    "Vindkraft2/MapServer/8/": () => ok(EMPTY_LAYER),
    "Vindkraft2/MapServer/4/": () => ok(TURBINE_LAYER),
    "Vannkraft1/MapServer/0/": () => ok(HYDRO_LAYER),
    "Havvind2023/MapServer/0/": () => ok(EMPTY_LAYER),
    "factmaps.sodir.no/api/rest/services/Factmaps/FactMapsWGS84/MapServer/307/": () => ok(SODIR_LAYER),
    "factmaps.sodir.no/api/rest/services/Factmaps/FactMapsWGS84/MapServer/311/": () => ok(PIPELINE_LAYER),
    ...overrides,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((url: RequestInfo | URL) => {
      const u = String(url);
      const match = Object.keys(routes).find((needle) => u.includes(needle));
      if (!match) throw new Error(`Unexpected fetch in test: ${u}`);
      return routes[match]();
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/energy", () => {
  it("returns all layers when every source is healthy", async () => {
    mockFetch();
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.plants).toHaveLength(2); // 1 wind + 1 hydro
    expect(data.turbines).toHaveLength(1);
    expect(data.oilGasFacilities).toHaveLength(1);
    expect(data.pipelines).toHaveLength(1);
    expect(data.degradedSources).toEqual([]);
    expect(data.stats.totalCapacityMW).toBe(60);
    // Coordinates must be converted out of UTM into plausible lat/lon for Norway
    const wind = data.plants.find((p: { type: string }) => p.type === "vind");
    expect(wind.lat).toBeGreaterThan(57);
    expect(wind.lat).toBeLessThan(72);
  });

  it("still serves NVE data when Sodir times out (the 2026-08 outage)", async () => {
    mockFetch({
      "factmaps.sodir.no/api/rest/services/Factmaps/FactMapsWGS84/MapServer/307/": timeout,
      "factmaps.sodir.no/api/rest/services/Factmaps/FactMapsWGS84/MapServer/311/": timeout,
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.plants).toHaveLength(2);
    expect(data.oilGasFacilities).toEqual([]);
    expect(data.pipelines).toEqual([]);
    expect(data.degradedSources).toEqual(["sodir-anlegg", "sodir-ror"]);
  });

  it("treats an upstream HTTP error like a missing layer", async () => {
    mockFetch({
      "Vannkraft1/MapServer/0/": () => Promise.resolve(new Response("boom", { status: 500 })),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.plants).toHaveLength(1); // wind only
    expect(data.degradedSources).toContain("vann");
  });

  it("fails with 503 when no plant data is available at all", async () => {
    mockFetch({
      "Vindkraft2/MapServer/0/": timeout,
      "Vindkraft2/MapServer/1/": timeout,
      "Vindkraft2/MapServer/2/": timeout,
      "Vindkraft2/MapServer/8/": timeout,
      "Vindkraft2/MapServer/4/": timeout,
      "Vannkraft1/MapServer/0/": timeout,
      "Havvind2023/MapServer/0/": timeout,
      "factmaps.sodir.no/api/rest/services/Factmaps/FactMapsWGS84/MapServer/307/": timeout,
      "factmaps.sodir.no/api/rest/services/Factmaps/FactMapsWGS84/MapServer/311/": timeout,
    });
    const res = await GET();
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toBeTruthy();
  });
});
