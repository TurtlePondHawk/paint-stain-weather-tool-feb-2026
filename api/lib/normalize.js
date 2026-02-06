// api/lib/normalize.js

export function normalizeLoc(raw) {
  const s = String(raw || "").trim();

  // Canadian postal code, allowing optional space: "A1A 1A1" or "A1A1A1"
  const ca = s.toUpperCase().replace(/\s+/g, "");
  const isCanadaPostal = /^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(ca);

  const caCompact = isCanadaPostal ? ca : null;
  const caSpaced = isCanadaPostal ? `${ca.slice(0, 3)} ${ca.slice(3)}` : null;

  const isZipLike = /^[0-9]{5}(-[0-9]{4})?$/.test(s);

  // A safe, boring guardrail: stop absurdly long inputs from hitting upstreams
  const clipped = s.length > 120 ? s.slice(0, 120) : s;

  return {
    raw: clipped,
    isZipLike,
    isCanadaPostal,
    caCompact,
    caSpaced
  };
}

export function safeText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}
