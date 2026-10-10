import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

// One kommune, one dwelling type, one year: the smallest json-stat2 table
// buildResult accepts. Values are [KvPris, Omsetninger].
function table(year: string, price: number, count: number) {
  return {
    id: ["Region", "Boligtype", "ContentsCode", "Tid"],
    size: [1, 1, 2, 1],
    value: [price, count],
    dimension: {
      Region: { category: { index: { "0301": 0 }, label: { "0301": "Oslo" } } },
      Boligtype: { category: { index: { "01": 0 }, label: { "01": "Eneboliger" } } },
      ContentsCode: { category: { index: { KvPris: 0, Omsetninger: 1 }, label: { KvPris: "Kr/m²", Omsetninger: "Salg" } } },
      Tid: { category: { index: { [year]: 0 }, label: { [year]: year } } },
    },
  };
}

const timeout = () => Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError"));

function mockTables(t06035: () => Promise<Response>, t14545: () => Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: RequestInfo | URL) => (String(url).includes("06035") ? t06035() : t14545()))
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("GET /api/bolig", () => {
  it("merges both SSB tables into one timeline", async () => {
    mockTables(
      () => Promise.resolve(Response.json(table("2024", 90000, 300))),
      () => Promise.resolve(Response.json(table("2025", 95000, 280)))
    );
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).years).toEqual(["2024", "2025"]);
  });

  it("keeps the other table when one times out", async () => {
    mockTables(() => Promise.resolve(Response.json(table("2024", 90000, 300))), timeout);
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).years).toEqual(["2024"]);
  });

  it("fails with 502 only when both tables are unavailable", async () => {
    mockTables(timeout, () => Promise.resolve(new Response("down", { status: 503 })));
    const res = await GET();
    expect(res.status).toBe(502);
  });
});
