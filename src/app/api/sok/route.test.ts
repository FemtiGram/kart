import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

afterEach(() => vi.unstubAllGlobals());

const search = (query: string) => GET(new NextRequest(`http://localhost/api/sok?${query}`));

describe("GET /api/sok", () => {
  it("proxies a free-text search with an edge cache header", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ adresser: [] })));
    const res = await search("q=oslo");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=3600");
  });

  it("answers 504 with a JSON error when Geonorge times out", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new DOMException("timed out", "TimeoutError"))));
    const res = await search("q=oslo");
    expect(res.status).toBe(504);
    expect((await res.json()).error).toBeTruthy();
  });

  it("answers 502 when the body is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>maintenance</html>")));
    expect((await search("q=oslo")).status).toBe(502);
  });

  it("rejects a missing or too-short query", async () => {
    expect((await search("q=o")).status).toBe(400);
  });
});
