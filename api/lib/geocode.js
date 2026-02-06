// api/lib/geocode.js

import { fetchJson, UpstreamError } from "./http.js";
import { normalizeLoc, safeText } from "./normalize.js";

function pickBestOpenMeteoResult(queryNorm, results) {
  if (!Array.isArray(results) || results.length === 0) return null;

  // If user typed a 5-digit ZIP, try to prefer a result that includes a matching postal_code (rare)
  if (queryNorm.isZipLike) {
    const zip = queryNorm.raw.slice(0, 5);
    const exact = results.find(r => String(r.postal_code || "") === zip);
    if (exact) return exact;
  }

  // Otherwise, Open-Meteo already returns ranked results. Take top.
  return results[0];
}

async function geocodeOpenMeteo(name, { timeoutMs = 5000 } = {}) {
  const q = encodeURIComponent(name.trim());
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=5&language=en&format=json`;
  const data = await fetchJson(url, { timeoutMs, upstreamName: "open-meteo-geocode" });
  return data?.results || [];
}

async function geocodeNominatim(query, { timeoutMs = 6000 } = {}) {
  // Nominatim usage guidance expects a valid User-Agent and reasonable usage.
  // We restrict this fallback to Canadian postal codes only.
  const q = encodeURIComponent(query.trim());
  const url =
    `https://nominatim.openstreetmap.org/search?` +
    `q=${q}&format=jsonv2&addressdetails=1&limit=1&countrycodes=ca`;

  const data = await fetchJson(url, {
    timeoutMs,
    upstreamName: "nominatim",
    headers: {
      // Put a real project identifier here. This helps prevent silent blocking.
      "user-agent": "paint-stain-forecast/1.0 (contact: michael@michaelruhs.com)"
    }
  });

  if (!Array.isArray(data) || data.length === 0) return null;

  const r = data[0];
  const lat = Number(r.lat);
  const lon = Number(r.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const address = r.address || {};
  return {
    name: address.city || address.town || address.village || address.hamlet || address.county || safeText(r.display_name),
    admin1: address.state || address.province || null,
    country: address.country || "Canada",
    latitude: lat,
    longitude: lon,
    timezone: "auto",
    source: "nominatim"
  };
}

export async function geocodeLocation(locRaw) {
  const n = normalizeLoc(locRaw);
  if (!n.raw) return { ok: false, error: { code: "MISSING_LOCATION", message: "Missing loc. Use loc=ZIP or City." } };

  // 1) Try Open-Meteo with original input
  let results = await geocodeOpenMeteo(n.raw);
  let best = pickBestOpenMeteoResult(n, results);
  if (best) return { ok: true, result: { ...best, source: "open-meteo" } };

  // 2) If Canadian postal, try Open-Meteo with compact and spaced variants
  if (n.isCanadaPostal) {
    results = await geocodeOpenMeteo(n.caCompact);
    best = pickBestOpenMeteoResult(n, results);
    if (best) return { ok: true, result: { ...best, source: "open-meteo" } };

    results = await geocodeOpenMeteo(n.caSpaced);
    best = pickBestOpenMeteoResult(n, results);
    if (best) return { ok: true, result: { ...best, source: "open-meteo" } };

    // 3) Final fallback: Nominatim for CA postal codes only
    try {
      const nom = await geocodeNominatim(n.caSpaced);
      if (nom) return { ok: true, result: nom };
    } catch (err) {
      // Do not fail the entire request because fallback failed.
      // If Open-Meteo returns nothing and Nominatim errors, we still return "not found".
      if (err instanceof UpstreamError) {
        return {
          ok: false,
          error: {
            code: "LOCATION_NOT_FOUND",
            message: "Location not found. Try a nearby city name.",
            hint: "Postal code geocoding failed. Try entering the nearest city."
          }
        };
      }
      throw err;
    }
  }

  return {
    ok: false,
    error: {
      code: "LOCATION_NOT_FOUND",
      message: "Location not found. Try a nearby city name.",
      hint: "Try 'City, State' or a nearby larger city."
    }
  };
}
