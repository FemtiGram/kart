import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { upstreamError } from "@/lib/upstream";

const STATIC_PATH = join(process.cwd(), "public", "data", "kommuner.geojson");
const REMOTE_URL = "https://raw.githubusercontent.com/robhop/fylker-og-kommuner/main/Kommuner-M.geojson";

export async function GET() {
  // Prefer static file (built by scripts/fetch-kommuner.mjs)
  if (existsSync(STATIC_PATH)) {
    const data = JSON.parse(readFileSync(STATIC_PATH, "utf-8"));
    return Response.json(data);
  }

  // Fallback to remote fetch if static file doesn't exist
  try {
    const res = await fetch(REMOTE_URL, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      return Response.json({ error: "GeoJSON fetch failed" }, { status: res.status });
    }
    return Response.json(await res.json());
  } catch (err) {
    return upstreamError(err, "GitHub");
  }
}
