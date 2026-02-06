// api/lib/openMeteo.js

import { fetchJson } from "./http.js";

function round1(n) { return Math.round(n * 10) / 10; }
function round2(n) { return Math.round(n * 100) / 100; }
function toF(c) { return (c * 9 / 5) + 32; }
function toMph(kmh) { return kmh * 0.621371; }

export async function getForecast({ lat, lon, timezone = "auto", forecastDays = 4 }) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: [
      "temperature_2m",
      "relative_humidity_2m",
      "precipitation_probability",
      "precipitation",
      "wind_speed_10m"
    ].join(","),
    forecast_days: String(forecastDays),
    timezone: timezone || "auto"
  });

  const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
  const data = await fetchJson(url, { timeoutMs: 8000, upstreamName: "open-meteo-forecast" });

  const times = data?.hourly?.time || [];
  const tempC = data?.hourly?.temperature_2m || [];
  const hum = data?.hourly?.relative_humidity_2m || [];
  const pr = data?.hourly?.precipitation_probability || [];
  const precip = data?.hourly?.precipitation || [];
  const windKmh = data?.hourly?.wind_speed_10m || [];

  const hours = times.map((t, i) => ({
    time: new Date(t).toISOString(),
    temp_f: round1(toF(tempC[i])),
    humidity_pct: hum[i],
    rain_probability_pct: pr[i] ?? 0,
    precip_mm: precip[i] ?? 0,
    wind_mph: round1(toMph(windKmh[i] ?? 0)),
  }));

  return { hours, timezone: data?.timezone || timezone || "auto" };
}

export const round = { round1, round2 };
