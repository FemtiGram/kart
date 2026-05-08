const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  if (bucket.count >= RATE_LIMIT_MAX) return true;

  bucket.count++;
  return false;
}

function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

function normalizeFoundForStorage(value: unknown): string | null {
  if (value === "ja" || value === "delvis" || value === "nei") return value;
  return null;
}

function isFoundAnswered(value: unknown): boolean {
  return value === "ja" || value === "delvis" || value === "nei";
}

function normalizeString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_FEEDBACK_ENABLED === "false") {
    return Response.json({ error: "Feedback disabled" }, { status: 503 });
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return Response.json({ error: "Server not configured" }, { status: 500 });
  }

  if (isRateLimited(getClientIp(request))) {
    return Response.json(
      { error: "For mange forsøk. Prøv igjen om litt." },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.website === "string" && body.website.trim()) {
    return Response.json({ ok: true });
  }

  const found = normalizeFoundForStorage(body.found);
  const foundAnswered = isFoundAnswered(body.found);
  const message = normalizeString(body.message, 2000);
  const email = normalizeString(body.email, 200);
  const page = normalizeString(body.page, 200);
  const userAgent = request.headers.get("user-agent")?.slice(0, 500) ?? null;

  if (!foundAnswered && !message) {
    return Response.json({ error: "Empty feedback" }, { status: 400 });
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/feedback`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ found, message, email, page, user_agent: userAgent }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Feedback insert failed:", res.status, text);
    return Response.json({ error: "Could not save feedback" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
