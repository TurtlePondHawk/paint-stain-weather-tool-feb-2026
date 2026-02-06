/**
 * Paint/Stain Forecast API (serverless)
 * - Static frontend calls: /api/forecast?task=paint&loc=54552
 * - Uses Open-Meteo (no API key required): https://open-meteo.com/
 *
 * Deploy targets:
 * - Vercel: /api/forecast.js (this file)
 * - Netlify: wrap this handler or use Netlify functions (see README)
 */

import fs from "fs";
import path from "path";

import { UpstreamError, makeRequestId } from "./lib/http.js";
import { geocodeLocation } from "./lib/geocode.js";
import { getForecast } from "./lib/openMeteo.js";
import { buildThresholds, evaluateAt, findNextWindow, summarize, riskFromMargins, nextHourISO } from "./lib/decisionEngine.js";

const RULES_PATH = path.join(process.cwd(), "api", "rules.config.json");
const RULES = JSON.parse(fs.readFileSync(RULES_PATH, "utf8"));

const SCHEMA_VERSION = "1.0";

function json(res, statusCode, payload, {
  cacheControl = null
} = {}) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  if (cacheControl) res.setHeader("cache-control", cacheControl);
  res.end(JSON.stringify(payload));
}

function buildLocationObject(locQuery, geo) {
  return {
    query: locQuery,
    name: geo.name,
    admin1: geo.admin1 ?? null,
    country: geo.country ?? null,
    lat: geo.latitude,
    lon: geo.longitude,
    timezone: geo.timezone ?? "auto",
    source: geo.source || "open-meteo"
  };
}

export default async function handler(req, res) {
  const request_id = makeRequestId();

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const task = (url.searchParams.get("task") || "").toLowerCase();
    const loc = (url.searchParams.get("loc") || "").trim();

    if (!["paint", "stain"].includes(task)) {
      return json(res, 400, {
        schema_version: SCHEMA_VERSION,
        request_id,
        error: {
          code: "INVALID_TASK",
          message: "Invalid task. Use task=paint or task=stain.",
          hint: "Example: /api/forecast?task=paint&loc=54552"
        }
      });
    }

    if (!loc) {
      return json(res, 400, {
        schema_version: SCHEMA_VERSION,
        request_id,
        error: {
          code: "MISSING_LOCATION",
          message: "Missing loc. Use loc=ZIP or City.",
          hint: "Example: loc=54552 or loc=Madison, WI"
        }
      });
    }

    const geoRes = await geocodeLocation(loc);
    if (!geoRes.ok) {
      return json(res, 404, {
        schema_version: SCHEMA_VERSION,
        request_id,
        error: geoRes.error
      });
    }

    const location = buildLocationObject(loc, geoRes.result);
    const th = buildThresholds(RULES, task);

    const now = new Date();
    const evalStart = RULES.evaluation.round_start_to_next_hour
      ? nextHourISO(now.toISOString())
      : now.toISOString();

    const { hours, timezone } = await getForecast({
      lat: location.lat,
      lon: location.lon,
      timezone: location.timezone,
      forecastDays: 4
    });

    location.timezone = timezone;

    const startIdx = hours.findIndex(h => h.time >= evalStart);
    const idx = startIdx >= 0 ? startIdx : 0;

    const nowEval = evaluateAt(idx, hours, th);
    const nowRisk = riskFromMargins(nowEval.margins);
    const nowSummary = summarize(task, nowEval.ok, nowEval.reasons);

    const next = findNextWindow(hours, th, evalStart);
    const nextSummary = next.start
      ? (task === "paint" ? "Next paint-safe window found." : "Next stain-safe window found.")
      : "No safe window found in the next few days.";

    const payload = {
      schema_version: SCHEMA_VERSION,
      request_id,

      task,
      location,
      generated_at: new Date().toISOString(),

      now: {
        start: hours[idx]?.time ?? evalStart,
        end: hours[idx + th.min_window_hours]?.time ?? null,
        go: !!nowEval.ok,
        risk: nowRisk,
        summary: nowSummary,
        reasons: nowEval.reasons
      },

      next_window: {
        start: next.start,
        end: next.end,
        duration_hours: next.duration_hours,
        risk: next.risk,
        summary: nextSummary
      },

      thresholds: th,

      meta: {
        units: RULES.units || "us",
        data_sources: {
          geocoding_primary: "open-meteo",
          geocoding_fallback: "nominatim (canadian postal only)",
          forecast: "open-meteo"
        }
      },

      disclaimer:
        "Guidance only. Surface temperature, sun or shade, substrate moisture, and product-specific label requirements can override forecast-based rules."
    };

    // Public caching is safe because no personal data is included; location query is in URL.
    return json(res, 200, payload, {
      cacheControl: "public, s-maxage=900, max-age=600, stale-while-revalidate=3600"
    });

  } catch (err) {
    const isUpstream = err instanceof UpstreamError;

    return json(res, isUpstream ? err.status : 500, {
      schema_version: SCHEMA_VERSION,
      request_id,
      error: {
        code: isUpstream ? "UPSTREAM_ERROR" : "SERVER_ERROR",
        message: isUpstream ? "Forecast provider error. Try again." : "Server error.",
        hint: isUpstream ? "Try again in a minute or use a nearby city." : "If this persists, check server logs.",
        details: String(err?.detail || err?.message || err)
      }
    });
  }
}
