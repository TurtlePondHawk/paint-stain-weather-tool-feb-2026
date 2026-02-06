// api/lib/http.js

export class UpstreamError extends Error {
  constructor(message, { status = 502, upstream = null, detail = null } = {}) {
    super(message);
    this.name = "UpstreamError";
    this.status = status;
    this.upstream = upstream;
    this.detail = detail;
  }
}

export function makeRequestId() {
  return Math.random().toString(36).slice(2, 8) + "-" + Date.now().toString(36).slice(-4);
}

export async function fetchJson(url, {
  timeoutMs = 8000,
  headers = {},
  upstreamName = "upstream"
} = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
        ...headers
      }
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new UpstreamError(`Upstream error ${res.status}`, {
        status: 502,
        upstream: upstreamName,
        detail: text.slice(0, 300)
      });
    }

    return await res.json();
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new UpstreamError("Upstream timeout", {
        status: 504,
        upstream: upstreamName,
        detail: `Timeout after ${timeoutMs}ms`
      });
    }
    if (err instanceof UpstreamError) throw err;
    throw new UpstreamError("Upstream request failed", {
      status: 502,
      upstream: upstreamName,
      detail: String(err?.message || err)
    });
  } finally {
    clearTimeout(t);
  }
}
