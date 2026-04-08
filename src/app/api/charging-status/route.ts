const ENOVA_RT_URL = "https://api.data.enova.no/nobil/real-time/v1/Realtime";

export async function POST() {
  const apiKey = process.env.ENOVA_RT_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "Real-time not configured" }, { status: 503 });
  }

  try {
    const res = await fetch(ENOVA_RT_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        "Content-Length": "0",
      },
      body: "",
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return Response.json({ error: "Enova API error" }, { status: res.status });
    }

    const data = await res.json();
    return Response.json({ url: data.accessToken });
  } catch {
    return Response.json({ error: "Failed to get real-time token" }, { status: 500 });
  }
}
