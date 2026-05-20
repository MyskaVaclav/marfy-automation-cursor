import { LIMITS } from "../constants.js";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function pad3(n: number) {
  return String(n).padStart(3, "0");
}

/**
 * Compute UTC millis for the last Sunday of a given month at a specific UTC hour.
 * month is 0-based (0 = January).
 */
function lastSundayUtc(year: number, month: number, hourUtc: number): number {
  // Start from last day of month at given UTC hour
  const d = new Date(Date.UTC(year, month + 1, 0, hourUtc, 0, 0, 0));
  // getUTCDay(): 0 = Sunday, 1 = Monday, ...
  const diffToSunday = d.getUTCDay(); // days since Sunday
  const sundayDate = d.getUTCDate() - diffToSunday;
  const sunday = new Date(Date.UTC(year, month, sundayDate, hourUtc, 0, 0, 0));
  return sunday.getTime();
}

/**
 * Europe/Prague DST offset in milliseconds for a given UTC timestamp.
 * Standard time: UTC+1, DST (summer): UTC+2.
 *
 * Rules: last Sunday in March 01:00 UTC → last Sunday in October 01:00 UTC.
 */
function getPragueOffsetMs(utcMs: number): number {
  const d = new Date(utcMs);
  const year = d.getUTCFullYear();

  const dstStart = lastSundayUtc(year, 2, 1); // March (2) at 01:00 UTC
  const dstEnd = lastSundayUtc(year, 9, 1); // October (9) at 01:00 UTC

  // During DST interval → UTC+2, otherwise UTC+1
  const inDst = utcMs >= dstStart && utcMs < dstEnd;
  return (inDst ? 2 : 1) * 60 * 60 * 1000;
}

/** Format offset suffix like "+01:00" / "+02:00" for display. */
function pragueOffsetSuffix(utcMs: number): string {
  const minutes = getPragueOffsetMs(utcMs) / (60 * 1000);
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  const h = pad2(Math.floor(abs / 60));
  const m = pad2(abs % 60);
  return `${sign}${h}:${m}`;
}

export function ymdInCET(dateNow: Date): string {
  const utcMs = dateNow.getTime();
  const shifted = new Date(utcMs + getPragueOffsetMs(utcMs));
  const y = shifted.getUTCFullYear();
  const m = pad2(shifted.getUTCMonth() + 1);
  const d = pad2(shifted.getUTCDate());
  return `${y}-${m}-${d}`;
}

function makeCETMidnightMs(ymd: string): number {
  const [yStr, mStr, dStr] = ymd.split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    throw new Error(`Invalid ymd for makeCETMidnightMs: ${ymd}`);
  }
  // Local (Prague) midnight for that date: take UTC midnight and subtract local offset.
  const utcMidnight = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const offsetMs = getPragueOffsetMs(utcMidnight);
  return utcMidnight - offsetMs;
}

export function formatCET(ms: number): string {
  const offsetMs = getPragueOffsetMs(ms);
  const d = new Date(ms + offsetMs);
  const Y = d.getUTCFullYear();
  const M = pad2(d.getUTCMonth() + 1);
  const D = pad2(d.getUTCDate());
  const h = pad2(d.getUTCHours());
  const m = pad2(d.getUTCMinutes());
  const s = pad2(d.getUTCSeconds());
  const S = pad3(d.getUTCMilliseconds());
  const suffix = pragueOffsetSuffix(ms);
  return `${Y}-${M}-${D}T${h}:${m}:${s}.${S}${suffix}`;
}

/** 
 * Yesterday date string for subject/filename: YYYY-MM-DD.
 * 
 * Uses the SAME fixed CET-like (+01:00) day boundary as the evaluator window,
 * so a run at e.g. 00:01 CET will still name the report for the CET “yesterday”
 * instead of using raw UTC (which can lag the local day).
 */
export function yesterdayDateStr(): string {
  // Today’s date in local Prague time (CET/CEST with DST)
  const todayYMD = ymdInCET(new Date());
  const todayStartMs = makeCETMidnightMs(todayYMD);
  const prevDayDate = new Date(todayStartMs - 1);
  const prevYMD = ymdInCET(prevDayDate);
  const yesterdayStartMs = makeCETMidnightMs(prevYMD);

  // Convert back to local Prague date components (similar to formatCET, but date-only)
  const offsetMs = getPragueOffsetMs(yesterdayStartMs);
  const d = new Date(yesterdayStartMs + offsetMs);
  const Y = d.getUTCFullYear();
  const M = pad2(d.getUTCMonth() + 1);
  const D = pad2(d.getUTCDate());
  return `${Y}-${M}-${D}`;
}

const COL = {
  time: "time",
  cellVmin: "cell_voltage_min_v_avg",
  cellVmax: "cell_voltage_max_v_avg",
  modVmin: "module_voltage_min_v_avg",
  modVmax: "module_voltage_max_v_avg",
  cellTmin: "cell_temp_min_c_avg",
  cellTmax: "cell_temp_max_c_avg",
  modTmin: "module_temp_min_c_avg",
  modTmax: "module_temp_max_c_avg",
  soc: "soc_pct_avg",
  cellIdMaxT: "cell_id_max_temp_avg",
  cellIdMinT: "cell_id_min_temp_avg",
  modIdMaxT: "module_id_max_temp_avg",
  modIdMinT: "module_id_min_temp_avg",
  cellIdMaxV: "cell_id_max_voltage_avg",
  cellIdMinV: "cell_id_min_voltage_avg",
  modIdMaxV: "module_id_max_voltage_avg",
  modIdMinV: "module_id_min_voltage_avg",
} as const;

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim().replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toMs(t: unknown): number | null {
  if (t === null || t === undefined) return null;
  const ms = Date.parse(String(t));
  return Number.isFinite(ms) ? ms : null;
}

function pct(n: number, d: number): number {
  if (!d) return 0;
  return Math.round((n / d) * 10000) / 100;
}

/** Violation interval (start → resolved) for PDF-friendly report. */
export interface ViolationRange {
  metric: string;
  type: string;
  startTime: string;
  endTime: string;
  openEnded: boolean;
  duration: string;
  points: number;
  unit: string | null;
  worstValue: number | null;
  minValue: number | null;
  maxValue: number | null;
  worstText: string;
  minText: string;
  maxText: string;
  ruleText: string;
  detailsText: string;
}

interface ViolationRangeRaw {
  metric: string;
  type: string;
  rule: { min?: number; max?: number; unit?: string };
  unit: string | null;
  startTime: string;
  startMs: number;
  endTime: string | null;
  endMs: number | null;
  lastBadTime: string;
  lastBadMs: number;
  points: number;
  minValue: number | null;
  maxValue: number | null;
  worstValue: number | null;
  ids: Set<string>;
  openEnded: boolean;
  durationMs: number | null;
  duration: string | null;
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return "";
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function roundTo(v: number | null | undefined, d: number): number | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const p = 10 ** d;
  return Math.round(v * p) / p;
}

function decimalsFor(unit: string | null, metric: string): number {
  if (unit === "V") {
    if (String(metric).includes("spread")) return 4;
    return 3;
  }
  if (unit === "°C") return 1;
  if (unit === "%") return 1;
  return 3;
}

function fmt(v: number | null | undefined, d: number): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "";
  const r = roundTo(v, d);
  return r === null ? "" : r.toFixed(d);
}

function fmtSmart(v: number | null | undefined, unit: string | null, metric: string): string {
  const d = decimalsFor(unit, metric);
  return fmt(v, d);
}

function fmtRule(
  rule: { min?: number; max?: number; unit?: string } | null,
  unit: string | null,
  metric: string
): string {
  if (!rule) return "";
  const u = rule.unit ?? unit ?? "";
  const d = decimalsFor(u, metric);
  if (rule.min !== undefined && rule.max !== undefined) {
    return `${fmt(rule.min, d)}–${fmt(rule.max, d)} ${u}`.trim();
  }
  if (rule.max !== undefined) {
    return `≤ ${fmt(rule.max, d)} ${u}`.trim();
  }
  return JSON.stringify(rule);
}

function fmtIds(idsArr: string[], cap = 12): string {
  const ids = idsArr
    .map((x) => String(x).trim())
    .filter((x) => x.length > 0);

  if (!ids.length) return "";

  ids.sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    const fa = Number.isFinite(na);
    const fb = Number.isFinite(nb);
    if (fa && fb) return na - nb;
    if (fa && !fb) return -1;
    if (!fa && fb) return 1;
    return a.localeCompare(b);
  });

  const shown = ids.slice(0, cap);
  const rest = ids.length - shown.length;
  return rest > 0
    ? `IDs: ${shown.join(", ")} (+${rest} dalších)`
    : `IDs: ${shown.join(", ")}`;
}

function addIdsFromDetailsToSet(set: Set<string>, details: { idMax?: unknown; idMin?: unknown } | null): void {
  if (!set || !details) return;
  const idMax = details.idMax;
  const idMin = details.idMin;
  if (idMax !== null && idMax !== undefined && String(idMax).trim() !== "") set.add(String(idMax).trim());
  if (idMin !== null && idMin !== undefined && String(idMin).trim() !== "") set.add(String(idMin).trim());
}

function tally(values: unknown[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of values) {
    const n = toNum(v);
    if (n === null) continue;
    const key = String(Math.trunc(n));
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return m;
}

function tallyInc(map: Map<string, number>, v: unknown): void {
  const n = toNum(v);
  if (n === null) return;
  const key = String(Math.trunc(n));
  map.set(key, (map.get(key) ?? 0) + 1);
}

function minMaxPush(state: { min: number; max: number }, v: number | null): void {
  if (v === null) return;
  if (v < state.min) state.min = v;
  if (v > state.max) state.max = v;
}

export interface TopShare {
  topId: string | null;
  topCount: number;
  topPct: number;
  total: number;
  breakdown: { id: string; count: number; pct: number }[];
}

function topShare(map: Map<string, number>): TopShare {
  if (!map.size)
    return {
      topId: null,
      topCount: 0,
      topPct: 0,
      total: 0,
      breakdown: [],
    };
  let total = 0;
  let topId: string | null = null;
  let topCount = -1;
  for (const [k, c] of map.entries()) {
    total += c;
    if (c > topCount) {
      topCount = c;
      topId = k;
    }
  }
  const breakdown = [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, count]) => ({ id, count, pct: pct(count, total) }));
  return {
    topId,
    topCount,
    topPct: pct(topCount, total),
    total,
    breakdown,
  };
}

export interface EvaluatorResult {
  ok: boolean;
  error?: string;
  window?: { start: string; end: string };
  limits?: typeof LIMITS;
  summary?: {
    window: { start: string; end: string; points: number };
    cell_voltage: { min: number | null; max: number | null; unit: string };
    module_voltage: { min: number | null; max: number | null; unit: string };
    cell_temp: { min: number | null; max: number | null; unit: string };
    module_temp: { min: number | null; max: number | null; unit: string };
    soc: { min: number | null; max: number | null; unit: string };
    counts: { totalViolations: number; violatedTimestamps: number };
  };
  violationRanges?: ViolationRange[];
  top?: {
    cell_max_temp: TopShare;
    cell_min_temp: TopShare;
    mod_max_temp: TopShare;
    mod_min_temp: TopShare;
    cell_max_volt: TopShare;
    cell_min_volt: TopShare;
    mod_max_volt: TopShare;
    mod_min_volt: TopShare;
  };
}

/** Filter rows by CET yesterday window and run compliance evaluation. */
export function evaluateDaily(
  rows: Record<string, unknown>[]
): EvaluatorResult {
  const todayYMD = ymdInCET(new Date());
  const todayStartMs = makeCETMidnightMs(todayYMD);
  const prevDayDate = new Date(todayStartMs - 1);
  const prevYMD = ymdInCET(prevDayDate);
  const startMs = makeCETMidnightMs(prevYMD);
  const endMs = todayStartMs;
  const startStr = formatCET(startMs);
  const endStr = formatCET(endMs);

  // Only rows from the previous Prague-time day are evaluated, in timestamp order.
  const windowRows = rows
    .filter((r) => {
      const t = r[COL.time];
      if (!t) return false;
      const ms = toMs(t);
      return ms !== null && ms >= startMs && ms < endMs;
    })
    .sort(
      (a, b) =>
        (toMs(a[COL.time]) ?? 0) - (toMs(b[COL.time]) ?? 0)
    ) as Record<string, unknown>[];

  if (!windowRows.length) {
    return {
      ok: false,
      error: "No rows found in yesterday window",
      window: { start: startStr, end: endStr },
    };
  }

  const N = windowRows.length;
  const violatedTs = new Set<string>();
  const mmCellV = { min: Infinity, max: -Infinity };
  const mmModV = { min: Infinity, max: -Infinity };
  const mmCellT = { min: Infinity, max: -Infinity };
  const mmModT = { min: Infinity, max: -Infinity };
  const mmSoc = { min: Infinity, max: -Infinity };

  const tCellMaxT = new Map<string, number>();
  const tCellMinT = new Map<string, number>();
  const tModMaxT = new Map<string, number>();
  const tModMinT = new Map<string, number>();
  const tCellMaxV = new Map<string, number>();
  const tCellMinV = new Map<string, number>();
  const tModMaxV = new Map<string, number>();
  const tModMinV = new Map<string, number>();

  const open = new Map<string, ViolationRangeRaw>();
  const violationRangesRaw: ViolationRangeRaw[] = [];

  function makeKey(metric: string, type: string): string {
    return `${metric}::${type}`;
  }

  function startRange(
    metric: string,
    type: string,
    rule: { min?: number; max?: number; unit?: string },
    unit: string | null,
    t: string,
    ms: number,
    value: number | null,
    details: { idMax?: unknown; idMin?: unknown } | null
  ): ViolationRangeRaw {
    const ids = new Set<string>();
    addIdsFromDetailsToSet(ids, details);
    return {
      metric,
      type,
      rule,
      unit,
      startTime: t,
      startMs: ms,
      endTime: null,
      endMs: null,
      lastBadTime: t,
      lastBadMs: ms,
      points: 1,
      minValue: value,
      maxValue: value,
      worstValue: value,
      ids,
      openEnded: false,
      durationMs: null,
      duration: null,
    };
  }

  function updateRange(
    rg: ViolationRangeRaw,
    ms: number,
    t: string,
    value: number | null,
    details: { idMax?: unknown; idMin?: unknown } | null,
    isBelowType: boolean
  ): void {
    rg.lastBadTime = t;
    rg.lastBadMs = ms;
    rg.points += 1;
    if (value !== null) {
      rg.minValue = rg.minValue === null ? value : Math.min(rg.minValue, value);
      rg.maxValue = rg.maxValue === null ? value : Math.max(rg.maxValue, value);
      rg.worstValue =
        rg.worstValue === null
          ? value
          : isBelowType
            ? Math.min(rg.worstValue, value)
            : Math.max(rg.worstValue, value);
    }
    addIdsFromDetailsToSet(rg.ids, details);
  }

  function closeRange(key: string, resolvedTime: string, resolvedMs: number): void {
    const rg = open.get(key);
    if (!rg) return;
    rg.endTime = resolvedTime;
    rg.endMs = resolvedMs;
    rg.durationMs = rg.endMs - rg.startMs;
    rg.duration = formatDuration(rg.durationMs);
    violationRangesRaw.push(rg);
    open.delete(key);
  }

  function track(
    metric: string,
    type: string,
    isBad: boolean,
    t: string,
    ms: number,
    value: number | null,
    rule: { min?: number; max?: number; unit?: string },
    unit: string,
    details: { idMax?: unknown; idMin?: unknown } | null
  ): void {
    const key = makeKey(metric, type);
    const isBelow = type === "below_min";
    const isActive = open.has(key);

    // Consecutive bad points are merged into one violation interval.
    if (isBad) {
      if (!isActive) {
        open.set(key, startRange(metric, type, rule, unit, t, ms, value, details));
      } else {
        updateRange(open.get(key)!, ms, t, value, details, isBelow);
      }
    } else {
      if (isActive) closeRange(key, t, ms);
    }
  }

  for (let i = 0; i < N; i++) {
    const row = windowRows[i] as Record<string, unknown>;
    const ms = toMs(row[COL.time]) ?? 0;
    const t = String(row[COL.time] ?? "");

    // Sheet values arrive as unknown strings/numbers, so normalize before checks.
    const cTmin = toNum(row[COL.cellTmin]);
    const cTmax = toNum(row[COL.cellTmax]);
    const mTmin = toNum(row[COL.modTmin]);
    const mTmax = toNum(row[COL.modTmax]);
    const cVmin = toNum(row[COL.cellVmin]);
    const cVmax = toNum(row[COL.cellVmax]);
    const mVmin = toNum(row[COL.modVmin]);
    const mVmax = toNum(row[COL.modVmax]);
    const s = toNum(row[COL.soc]);

    minMaxPush(mmCellV, cVmin);
    minMaxPush(mmCellV, cVmax);
    minMaxPush(mmModV, mVmin);
    minMaxPush(mmModV, mVmax);
    minMaxPush(mmCellT, cTmin);
    minMaxPush(mmCellT, cTmax);
    minMaxPush(mmModT, mTmin);
    minMaxPush(mmModT, mTmax);
    minMaxPush(mmSoc, s);

    let anyBadThisRow = false;

    // Absolute limits are checked independently from spread limits.
    const cTminBad = cTmin !== null && cTmin < LIMITS.cellTemp.min;
    const cTmaxBad = cTmax !== null && cTmax > LIMITS.cellTemp.max;
    track("cell_temp_min", "below_min", cTminBad, t, ms, cTmin, LIMITS.cellTemp, "°C", null);
    track("cell_temp_max", "above_max", cTmaxBad, t, ms, cTmax, LIMITS.cellTemp, "°C", null);
    if (cTminBad || cTmaxBad) anyBadThisRow = true;

    const mTminBad = mTmin !== null && mTmin < LIMITS.modTemp.min;
    const mTmaxBad = mTmax !== null && mTmax > LIMITS.modTemp.max;
    track("module_temp_min", "below_min", mTminBad, t, ms, mTmin, LIMITS.modTemp, "°C", null);
    track("module_temp_max", "above_max", mTmaxBad, t, ms, mTmax, LIMITS.modTemp, "°C", null);
    if (mTminBad || mTmaxBad) anyBadThisRow = true;

    const socLow = s !== null && s < LIMITS.soc.min;
    const socHigh = s !== null && s > LIMITS.soc.max;
    track("soc", "below_min", socLow, t, ms, s, LIMITS.soc, "%", null);
    track("soc", "above_max", socHigh, t, ms, s, LIMITS.soc, "%", null);
    if (socLow || socHigh) anyBadThisRow = true;

    const cVminBad = cVmin !== null && cVmin < LIMITS.cellVolt.min;
    const cVmaxBad = cVmax !== null && cVmax > LIMITS.cellVolt.max;
    track("cell_voltage_min", "below_min", cVminBad, t, ms, cVmin, LIMITS.cellVolt, "V", null);
    track("cell_voltage_max", "above_max", cVmaxBad, t, ms, cVmax, LIMITS.cellVolt, "V", null);
    if (cVminBad || cVmaxBad) anyBadThisRow = true;

    if (cTmin !== null && cTmax !== null) {
      const spread = cTmax - cTmin;
      const bad = spread > LIMITS.cellTempSpreadMax;
      track(
        "cell_temp_spread",
        "spread_exceeded",
        bad,
        t,
        ms,
        spread,
        { max: LIMITS.cellTempSpreadMax, unit: "°C" },
        "°C",
        bad ? { idMax: row[COL.cellIdMaxT], idMin: row[COL.cellIdMinT] } : null
      );
      if (bad) anyBadThisRow = true;
    } else {
      track("cell_temp_spread", "spread_exceeded", false, t, ms, null, { max: LIMITS.cellTempSpreadMax, unit: "°C" }, "°C", null);
    }

    if (mTmin !== null && mTmax !== null) {
      const spread = mTmax - mTmin;
      const bad = spread > LIMITS.modTempSpreadMax;
      track(
        "module_temp_spread",
        "spread_exceeded",
        bad,
        t,
        ms,
        spread,
        { max: LIMITS.modTempSpreadMax, unit: "°C" },
        "°C",
        bad ? { idMax: row[COL.modIdMaxT], idMin: row[COL.modIdMinT] } : null
      );
      if (bad) anyBadThisRow = true;
    } else {
      track("module_temp_spread", "spread_exceeded", false, t, ms, null, { max: LIMITS.modTempSpreadMax, unit: "°C" }, "°C", null);
    }

    if (mVmin !== null && mVmax !== null) {
      const spread = mVmax - mVmin;
      const bad = spread > LIMITS.moduleVoltSpreadMax;
      track(
        "module_voltage_spread",
        "spread_exceeded",
        bad,
        t,
        ms,
        spread,
        { max: LIMITS.moduleVoltSpreadMax, unit: "V" },
        "V",
        bad ? { idMax: row[COL.modIdMaxV], idMin: row[COL.modIdMinV] } : null
      );
      if (bad) anyBadThisRow = true;
    } else {
      track("module_voltage_spread", "spread_exceeded", false, t, ms, null, { max: LIMITS.moduleVoltSpreadMax, unit: "V" }, "V", null);
    }

    if (cVmin !== null && cVmax !== null) {
      const spread = cVmax - cVmin;
      const bad = spread > LIMITS.cellVoltSpreadMax;
      track(
        "cell_voltage_spread",
        "spread_exceeded",
        bad,
        t,
        ms,
        spread,
        { max: LIMITS.cellVoltSpreadMax, unit: "V" },
        "V",
        bad ? { idMax: row[COL.cellIdMaxV], idMin: row[COL.cellIdMinV] } : null
      );
      if (bad) anyBadThisRow = true;
    } else {
      track("cell_voltage_spread", "spread_exceeded", false, t, ms, null, { max: LIMITS.cellVoltSpreadMax, unit: "V" }, "V", null);
    }

    if (anyBadThisRow) violatedTs.add(t);

    tallyInc(tCellMaxT, row[COL.cellIdMaxT]);
    tallyInc(tCellMinT, row[COL.cellIdMinT]);
    tallyInc(tModMaxT, row[COL.modIdMaxT]);
    tallyInc(tModMinT, row[COL.modIdMinT]);
    tallyInc(tCellMaxV, row[COL.cellIdMaxV]);
    tallyInc(tCellMinV, row[COL.cellIdMinV]);
    tallyInc(tModMaxV, row[COL.modIdMaxV]);
    tallyInc(tModMinV, row[COL.modIdMinV]);
  }

  for (const [key, rg] of open.entries()) {
    // If a violation never resolves inside the window, close it at the window end.
    rg.endTime = endStr;
    rg.endMs = endMs;
    rg.openEnded = true;
    rg.durationMs = rg.endMs - rg.startMs;
    rg.duration = formatDuration(rg.durationMs);
    violationRangesRaw.push(rg);
  }
  open.clear();

  const top = {
    cell_max_temp: topShare(tCellMaxT),
    cell_min_temp: topShare(tCellMinT),
    mod_max_temp: topShare(tModMaxT),
    mod_min_temp: topShare(tModMinT),
    cell_max_volt: topShare(tCellMaxV),
    cell_min_volt: topShare(tCellMinV),
    mod_max_volt: topShare(tModMaxV),
    mod_min_volt: topShare(tModMinV),
  };

  const finalizeMM = (mm: { min: number; max: number }) =>
    mm.min === Infinity ? { min: null as number | null, max: null as number | null } : { min: mm.min, max: mm.max };

  // Convert raw interval state into report-ready values and display strings.
  const violationRanges: ViolationRange[] = violationRangesRaw.map((v) => {
    const unit = v.unit ?? (v.rule?.unit ?? null);
    const d = decimalsFor(unit, v.metric);
    const idsText =
      v.type === "spread_exceeded" && v.ids.size
        ? fmtIds([...v.ids], 12)
        : "";
    return {
      metric: v.metric,
      type: v.type,
      startTime: v.startTime,
      endTime: v.endTime ?? "",
      openEnded: v.openEnded,
      duration: v.duration ?? "",
      points: v.points,
      unit,
      worstValue: roundTo(v.worstValue, d),
      minValue: roundTo(v.minValue, d),
      maxValue: roundTo(v.maxValue, d),
      worstText: `${fmtSmart(v.worstValue, unit, v.metric)}${unit ? " " + unit : ""}`.trim(),
      minText: fmtSmart(v.minValue, unit, v.metric),
      maxText: fmtSmart(v.maxValue, unit, v.metric),
      ruleText: fmtRule(v.rule, unit, v.metric),
      detailsText: idsText,
    };
  });

  const summary = {
    window: { start: startStr, end: endStr, points: N },
    cell_voltage: { ...finalizeMM(mmCellV), unit: "V" },
    module_voltage: { ...finalizeMM(mmModV), unit: "V" },
    cell_temp: { ...finalizeMM(mmCellT), unit: "°C" },
    module_temp: { ...finalizeMM(mmModT), unit: "°C" },
    soc: { ...finalizeMM(mmSoc), unit: "%" },
    counts: {
      totalViolations: violationRanges.length,
      violatedTimestamps: violatedTs.size,
    },
  };

  return {
    ok: true,
    limits: LIMITS,
    summary,
    violationRanges,
    top,
  };
}

/** Get yesterday window bounds (CET) for filtering. */
export function getYesterdayWindow(): { startMs: number; endMs: number; startStr: string; endStr: string } {
  const todayYMD = ymdInCET(new Date());
  const todayStartMs = makeCETMidnightMs(todayYMD);
  const prevDayDate = new Date(todayStartMs - 1);
  const prevYMD = ymdInCET(prevDayDate);
  const startMs = makeCETMidnightMs(prevYMD);
  const endMs = todayStartMs;
  return {
    startMs,
    endMs,
    startStr: formatCET(startMs),
    endStr: formatCET(endMs),
  };
}
