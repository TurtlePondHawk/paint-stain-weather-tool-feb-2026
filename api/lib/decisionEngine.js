// api/lib/decisionEngine.js

import { round } from "./openMeteo.js";

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function reason(code, message, observed, threshold) {
  return { code, message, observed, threshold };
}

export function riskFromMargins(margins) {
  const worst = Math.min(...margins.filter(m => Number.isFinite(m)));
  if (!Number.isFinite(worst)) return "medium";
  if (worst >= 0.25) return "low";
  if (worst >= 0.10) return "medium";
  return "high";
}

export function buildThresholds(RULES, taskKey) {
  const g = RULES.global;
  const t = RULES.tasks[taskKey];
  return {
    task: taskKey,
    label: t.label,
    min_temp_f: g.min_temp_f,
    overnight_min_temp_f: g.overnight_min_temp_f,
    rain_probability_max_pct: g.rain_probability_max_pct,
    precipitation_max_mm: g.precipitation_max_mm,
    max_humidity_pct: t.max_humidity_pct,
    max_wind_mph: t.max_wind_mph,
    min_window_hours: RULES.evaluation.min_window_hours,
    no_rain_buffer_hours: t.no_rain_buffer_hours,
    horizon_hours: RULES.horizon_hours,
  };
}

export function evaluateAt(startIdx, hours, th) {
  const win = th.min_window_hours;
  const buf = th.no_rain_buffer_hours;

  if (startIdx + win + buf > hours.length) {
    return {
      ok: false,
      reasons: [reason("insufficient_data", "Not enough forecast data to evaluate the full window.", {}, {})],
      margins: []
    };
  }

  const reasons = [];
  const margins = [];

  let maxRainProb = 0, maxWind = 0, maxHum = 0, minTempF = Infinity;
  let totalPrecip = 0;

  for (let i = startIdx; i < startIdx + win; i++) {
    const h = hours[i];
    maxRainProb = Math.max(maxRainProb, h.rain_probability_pct);
    maxWind = Math.max(maxWind, h.wind_mph);
    maxHum = Math.max(maxHum, h.humidity_pct);
    minTempF = Math.min(minTempF, h.temp_f);
    totalPrecip += h.precip_mm;
  }

  let maxRainProbBuf = 0, totalPrecipBuf = 0;
  for (let i = startIdx + win; i < startIdx + win + buf; i++) {
    const h = hours[i];
    maxRainProbBuf = Math.max(maxRainProbBuf, h.rain_probability_pct);
    totalPrecipBuf += h.precip_mm;
  }

  const overnightSliceEnd = Math.min(startIdx + 24, hours.length);
  let overnightMinF = Infinity;
  for (let i = startIdx; i < overnightSliceEnd; i++) {
    overnightMinF = Math.min(overnightMinF, hours[i].temp_f);
  }

  if (minTempF < th.min_temp_f) {
    reasons.push(reason(
      "temp_too_low",
      `Temperature dips below ${th.min_temp_f}°F during the work window.`,
      { min_temp_f: round.round1(minTempF) },
      { min_temp_f: th.min_temp_f }
    ));
  }
  margins.push((minTempF - th.min_temp_f) / 20);

  if (overnightMinF < th.overnight_min_temp_f) {
    reasons.push(reason(
      "overnight_temp_risk",
      `Overnight low is below ${th.overnight_min_temp_f}°F in the next 24 hours (curing risk).`,
      { overnight_min_temp_f: round.round1(overnightMinF) },
      { overnight_min_temp_f: th.overnight_min_temp_f }
    ));
  }
  margins.push((overnightMinF - th.overnight_min_temp_f) / 20);

  if (maxHum > th.max_humidity_pct) {
    reasons.push(reason(
      "humidity_too_high",
      `Humidity exceeds ${th.max_humidity_pct}% during the work window.`,
      { max_humidity_pct: round.round1(maxHum) },
      { max_humidity_pct: th.max_humidity_pct }
    ));
  }
  margins.push((th.max_humidity_pct - maxHum) / 30);

  if (maxWind > th.max_wind_mph) {
    reasons.push(reason(
      "wind_too_high",
      `Wind exceeds ${th.max_wind_mph} mph during the work window.`,
      { max_wind_mph: round.round1(maxWind) },
      { max_wind_mph: th.max_wind_mph }
    ));
  }
  margins.push((th.max_wind_mph - maxWind) / 20);

  if (maxRainProb > th.rain_probability_max_pct) {
    reasons.push(reason(
      "rain_risk_during",
      `Rain probability exceeds ${th.rain_probability_max_pct}% during the work window.`,
      { max_rain_probability_pct: round.round1(maxRainProb) },
      { rain_probability_max_pct: th.rain_probability_max_pct }
    ));
  }
  margins.push((th.rain_probability_max_pct - maxRainProb) / 30);

  if (totalPrecip > th.precipitation_max_mm) {
    reasons.push(reason(
      "precipitation_during",
      "Forecast includes measurable precipitation during the work window.",
      { total_precip_mm: round.round2(totalPrecip) },
      { precipitation_max_mm: th.precipitation_max_mm }
    ));
  }
  margins.push((th.precipitation_max_mm - totalPrecip) / 1);

  if (maxRainProbBuf > th.rain_probability_max_pct) {
    reasons.push(reason(
      "rain_risk_after",
      `Rain probability exceeds ${th.rain_probability_max_pct}% in the curing buffer window.`,
      { max_rain_probability_pct_buffer: round.round1(maxRainProbBuf), buffer_hours: th.no_rain_buffer_hours },
      { rain_probability_max_pct: th.rain_probability_max_pct, buffer_hours: th.no_rain_buffer_hours }
    ));
  }
  margins.push((th.rain_probability_max_pct - maxRainProbBuf) / 30);

  if (totalPrecipBuf > th.precipitation_max_mm) {
    reasons.push(reason(
      "precipitation_after",
      "Forecast includes measurable precipitation in the curing buffer window.",
      { total_precip_mm_buffer: round.round2(totalPrecipBuf), buffer_hours: th.no_rain_buffer_hours },
      { precipitation_max_mm: th.precipitation_max_mm, buffer_hours: th.no_rain_buffer_hours }
    ));
  }
  margins.push((th.precipitation_max_mm - totalPrecipBuf) / 1);

  return { ok: reasons.length === 0, reasons, margins };
}

export function summarize(taskKey, ok, reasons) {
  if (ok) return taskKey === "paint"
    ? "Go: professional-safe paint conditions."
    : "Go: professional-safe stain conditions.";

  const top = reasons.slice(0, 2).map(r => r.message.replace(/\.$/, "")).join("; ");
  return `No-go: ${top}.`;
}

export function findNextWindow(hours, th, startTimeISO) {
  const startTime = new Date(startTimeISO).getTime();
  const startIdx = hours.findIndex(h => new Date(h.time).getTime() >= startTime);
  const from = startIdx >= 0 ? startIdx : 0;

  const maxHours = th.horizon_hours ?? hours.length;
  const to = Math.min(from + maxHours, hours.length);

  for (let i = from; i < to; i++) {
    const ev = evaluateAt(i, hours, th);
    if (ev.ok) {
      const start = hours[i].time;
      const end = hours[i + th.min_window_hours].time;
      const risk = riskFromMargins(ev.margins);
      return { start, end, duration_hours: th.min_window_hours, risk, reasons: ev.reasons };
    }
  }
  return { start: null, end: null, duration_hours: null, risk: null, reasons: [] };
}

export function nextHourISO(now) {
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d.toISOString();
}
