/**
 * Small test harness for: token extraction, cookie extraction,
 * chart data -> rows mapping, and daily window filtering.
 */
import { extractAntiforgeryToken, extractBaseCookies, mergeIdentityCookie } from "../lib/extract.js";
import { chartDataToRows } from "../lib/chartToRows.js";
import { evaluateDaily, getYesterdayWindow, ymdInCET, formatCET } from "../lib/evaluator.js";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

// --- Token extraction ---
const sampleHtml = `
<form>
  <input name="__RequestVerificationToken" value="abc123xyz" type="hidden" />
</form>`;
const token = extractAntiforgeryToken(sampleHtml);
assert(token === "abc123xyz", "token extraction");

// --- Cookie extraction (base) ---
const setCookies = [
  "other=ignored",
  ".AspNetCore.Session=session123; path=/; httpOnly",
  ".AspNetCore.Antiforgery.x=antiforgery456; path=/",
];
const baseCookie = extractBaseCookies(setCookies);
assert(
  baseCookie.includes("Session=session123") && baseCookie.includes("Antiforgery"),
  "base cookie extraction"
);

// --- Identity cookie merge ---
const loginSetCookie = [".AspNetCore.Identity.Application=identity789; path=/; httpOnly"];
const fullCookie = mergeIdentityCookie(baseCookie, loginSetCookie);
assert(fullCookie.includes("Identity.Application=identity789"), "identity merge");

// --- Chart data -> rows ---
const chartResponse = {
  labelsData: [1700000000000, 1700000060000],
  dictData: {
    el_23765_avg: [50.1, 51.2],
    el_23768_avg: [10.5, 11.0],
  },
};
const rows = chartDataToRows(chartResponse);
assert(rows.length === 2, "row count");
assert(rows[0].time !== undefined, "time column");
assert(rows[0].soc_pct_avg === 50.1, "soc_pct_avg");
assert(rows[1].dc_current_a_avg === 11.0, "dc_current_a_avg");

// --- Daily window filtering (CET) ---
const window = getYesterdayWindow();
assert(typeof window.startMs === "number", "window startMs");
assert(typeof window.endMs === "number", "window endMs");
assert(window.startStr.includes("T"), "window startStr format");
assert(/[+](01|02):00$/.test(window.endStr), "CET/CEST suffix");

const ymd = ymdInCET(new Date());
assert(/^\d{4}-\d{2}-\d{2}$/.test(ymd), "ymd format");

const emptyEval = evaluateDaily([]);
assert(emptyEval.ok === false && emptyEval.error !== undefined, "empty rows -> ok:false");

const oneRow = [
  {
    time: window.startStr,
    cell_voltage_min_v_avg: 3.0,
    cell_voltage_max_v_avg: 3.2,
    module_voltage_min_v_avg: 48,
    module_voltage_max_v_avg: 49,
    cell_temp_min_c_avg: 15,
    cell_temp_max_c_avg: 18,
    module_temp_min_c_avg: 14,
    module_temp_max_c_avg: 19,
    soc_pct_avg: 50,
    cell_id_max_temp_avg: 1,
    cell_id_min_temp_avg: 2,
    module_id_max_temp_avg: 1,
    module_id_min_temp_avg: 2,
    cell_id_max_voltage_avg: 1,
    cell_id_min_voltage_avg: 2,
    module_id_max_voltage_avg: 1,
    module_id_min_voltage_avg: 2,
  },
];
const evalResult = evaluateDaily(oneRow);
assert(evalResult.ok === true && evalResult.summary?.window.points === 1, "one row eval");

console.log("All harness checks passed.");
