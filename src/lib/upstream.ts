// Shared failure handling for API routes that proxy an upstream service.
// A route wraps its fetch + body read in try/catch and returns
// upstreamError(err): a timeout (AbortSignal.timeout) becomes 504, anything
// else (network error, truncated or non-JSON body) 502 — always a JSON body,
// never Next's unhandled 500.
export function upstreamError(err: unknown, source: string): Response {
  const isTimeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
  console.warn(`[${source}] upstream ${isTimeout ? "timed out" : "failed"}:`, err);
  return Response.json(
    { error: isTimeout ? `${source} timed out` : `${source} unavailable` },
    { status: isTimeout ? 504 : 502 },
  );
}
