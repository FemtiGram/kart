import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const MET_RESPONSE = {
  properties: {
    timeseries: [
      {
        data: {
          instant: { details: { air_temperature: -3.2, wind_speed: 5.1 } },
          next_1_hours: { summary: { symbol_code: "cloudy" }, details: { precipitation_amount: 0.4 } },
        },
      },
    ],
  },
};

function metUrlFor(query: string) {
  const fetchMock = vi.fn(async () => Response.json(MET_RESPONSE));
  vi.stubGlobal("fetch", fetchMock);
  return GET(new NextRequest(`http://localhost/api/weather?${query}`)).then((res) => ({
    res,
    url: new URL((fetchMock.mock.calls[0] as unknown[] | undefined)?.[0] as string),
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe("GET /api/weather", () => {
  it("rounds coordinates to 4 decimals and passes altitude in whole metres", async () => {
    const { res, url } = await metUrlFor("lat=61.636312345&lon=8.312498765&altitude=2468.6");
    expect(url.searchParams.get("lat")).toBe("61.6363");
    expect(url.searchParams.get("lon")).toBe("8.3125");
    expect(url.searchParams.get("altitude")).toBe("2469");
    expect(await res.json()).toEqual({ temperature: -3.2, windSpeed: 5.1, precipitation: 0.4, symbolCode: "cloudy" });
  });

  it("omits altitude when it is missing or nonsensical", async () => {
    expect((await metUrlFor("lat=59.9&lon=10.7")).url.searchParams.has("altitude")).toBe(false);
    expect((await metUrlFor("lat=59.9&lon=10.7&altitude=abc")).url.searchParams.has("altitude")).toBe(false);
    expect((await metUrlFor("lat=59.9&lon=10.7&altitude=12000")).url.searchParams.has("altitude")).toBe(false);
  });

  it("answers 504 with a JSON error when MET times out", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new DOMException("timed out", "TimeoutError"))));
    const res = await GET(new NextRequest("http://localhost/api/weather?lat=59.9&lon=10.7"));
    expect(res.status).toBe(504);
    expect((await res.json()).error).toBeTruthy();
  });

  it("rejects requests without valid coordinates", async () => {
    const res = await GET(new NextRequest("http://localhost/api/weather?lat=abc&lon=10.7"));
    expect(res.status).toBe(400);
  });
});
