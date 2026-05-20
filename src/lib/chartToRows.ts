import { ID_TO_NAME } from "../constants.js";

export interface ChartResponse {
  labelsData?: number[];
  dictData?: Record<string, (number | null)[]>;
}

function parseKey(key: string): { elementId: number; agg: string } | null {
  // Marfy series keys use el_<elementId>_<aggregation>, for example el_23765_avg.
  const m = key.match(/^el_(\d+)_(\w+)$/);
  if (!m) return null;
  return { elementId: Number(m[1]), agg: m[2] };
}

export interface DataRow {
  time: string;
  [key: string]: string | number | null | undefined;
}

/**
 * Transform chart API response to row objects. Same logic as spec code node.
 */
export function chartDataToRows(raw: ChartResponse): DataRow[] {
  const r = Array.isArray(raw) ? (raw as unknown[])[0] : raw;
  const labels = (r as ChartResponse)?.labelsData;
  const dict = (r as ChartResponse)?.dictData;
  if (!labels || !Array.isArray(labels))
    throw new Error("labelsData missing");
  if (!dict || typeof dict !== "object") throw new Error("dictData missing");

  const seriesKeys = Object.keys(dict);
  const colNames = seriesKeys.map((k) => {
    const parsed = parseKey(k);
    if (!parsed) return k;
    // Convert Marfy element IDs to the stable column names used in Sheets.
    const base = ID_TO_NAME[parsed.elementId] ?? `element_${parsed.elementId}`;
    return `${base}_${parsed.agg}`;
  });
  const valueArrays = seriesKeys.map((k) => dict[k]);

  const len = labels.length;
  const rows: DataRow[] = new Array(len);
  for (let i = 0; i < len; i++) {
    // labelsData contains timestamps; dictData contains one value array per metric.
    const row: DataRow = { time: new Date(labels[i]).toISOString() };
    for (let s = 0; s < seriesKeys.length; s++) {
      const arr = valueArrays[s];
      row[colNames[s]] = Array.isArray(arr) ? (arr[i] ?? null) : null;
    }
    rows[i] = row;
  }
  return rows;
}
