import { google } from "googleapis";
import { SHEET_COLUMNS } from "../constants.js";
import type { DataRow } from "./chartToRows.js";
import { getGoogleAuthOptions } from "./googleAuth.js";
import { withTransientRetry } from "./retry.js";

/** Canonical column names by index so voltage/min/max columns are always read correctly. */
const COLUMNS_BY_INDEX = SHEET_COLUMNS as readonly string[];

const RATE_LIMIT_RETRY_DELAY_MS = 65_000; // just over 1 min to reset per-minute quota
const MAX_RATE_LIMIT_RETRIES = 3;

function isRateLimitError(e: unknown): boolean {
  const status = (e as { response?: { status?: number } })?.response?.status;
  const code = (e as { code?: number })?.code;
  return status === 429 || code === 429;
}

async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  // Google Sheets write quotas reset by minute, so 429 retries wait long enough to cross the boundary.
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_RATE_LIMIT_RETRIES && isRateLimitError(e)) {
        console.warn(`[sheets] Rate limit (429), waiting ${RATE_LIMIT_RETRY_DELAY_MS / 1000}s before retry ${attempt + 1}/${MAX_RATE_LIMIT_RETRIES}`);
        await new Promise((r) => setTimeout(r, RATE_LIMIT_RETRY_DELAY_MS));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

let _auth: Awaited<ReturnType<typeof google.auth.GoogleAuth.prototype.getClient>>;

async function getAuth() {
  // Reuse the Google auth client for all Sheets calls in the same process.
  if (_auth) return _auth;
  const opts = getGoogleAuthOptions();
  const auth = new google.auth.GoogleAuth({
    ...opts,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  _auth = (await auth.getClient()) as typeof _auth;
  return _auth;
}

export async function getSheetId(
  spreadsheetId: string,
  sheetName?: string
): Promise<number> {
  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const meta = await withTransientRetry(() =>
    sheets.spreadsheets.get({ spreadsheetId })
  );
  const sheetsList = meta.data.sheets ?? [];
  if (sheetName) {
    const tab = sheetsList.find(
      (s) =>
        (s.properties?.title ?? "").toLowerCase() === sheetName.toLowerCase()
    );
    const id = tab?.properties?.sheetId;
    if (id != null) return id;
  }
  const first = sheetsList[0]?.properties?.sheetId;
  if (first == null) throw new Error("No sheets in workbook");
  return first;
}

export async function getSheetTitle(
  spreadsheetId: string,
  sheetName?: string
): Promise<string> {
  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const meta = await withTransientRetry(() =>
    sheets.spreadsheets.get({ spreadsheetId })
  );
  const sheetsList = meta.data.sheets ?? [];
  if (sheetName) {
    const tab = sheetsList.find(
      (s) =>
        (s.properties?.title ?? "").toLowerCase() === sheetName.toLowerCase()
    );
    const title = tab?.properties?.title;
    if (title != null && title !== "") return title;
  }
  const first = sheetsList[0]?.properties?.title;
  return first != null ? first : "Sheet1";
}

export async function readAllRows(
  spreadsheetId: string,
  sheetName?: string,
  sheetTitle?: string
): Promise<Record<string, unknown>[]> {
  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const title = sheetTitle ?? (await getSheetTitle(spreadsheetId, sheetName));
  const range = `'${title}'!A:T`;
  const res = await withTransientRetry(() =>
    sheets.spreadsheets.values.get({ spreadsheetId, range })
  );
  const rows = (res.data.values as string[][] | undefined) ?? [];
  if (rows.length < 2) return [];
  const headerRow = rows[0];
  const keys = headerRow.map(
    (h, c) => String(h ?? "").trim() || COLUMNS_BY_INDEX[c] || ""
  );
  const out: Record<string, unknown>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row: Record<string, unknown> = {};
    const r = rows[i];
    for (let c = 0; c < keys.length; c++) {
      const key = keys[c];
      if (!key) continue;
      const val = r[c];
      row[key] = val === undefined || val === "" ? null : val;
    }
    out.push(row);
  }
  return out;
}

/**
 * Append or update rows by match key `time` using the canonical column order.
 * Side effects: Google Sheets API reads and writes.
 */
export async function appendOrUpdate(
  spreadsheetId: string,
  sheetName: string | undefined,
  rows: DataRow[],
  sheetTitle?: string
): Promise<void> {
  if (rows.length === 0) return;
  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const title = sheetTitle ?? (await getSheetTitle(spreadsheetId, sheetName));

  const existing = await withTransientRetry(() =>
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${title}'!A:T`,
    })
  );
  const existingRows = (existing.data.values as string[][] | undefined) ?? [];
  const header = existingRows[0] ?? [...SHEET_COLUMNS];
  const dataRows = existingRows.slice(1);
  if (existingRows.length === 0) {
    // Initialize an empty sheet before appending data rows.
    await withRateLimitRetry(() =>
      sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${title}'!A1:T1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [header] },
      })
    );
  }
  const timeCol = header.indexOf("time");
  const timeToRowIndex = new Map<string, number>();
  // Sheets row indexes are 1-based; data starts on row 2 after the header.
  for (let idx = 0; idx < dataRows.length; idx++) {
    const timeStr = timeCol >= 0 ? String(dataRows[idx][timeCol] ?? "") : "";
    if (timeStr !== "") timeToRowIndex.set(timeStr, idx + 2);
  }

  const toAppend: unknown[][] = [];
  const toUpdate: { rowIndex: number; values: unknown[] }[] = [];
  for (const row of rows) {
    const timeStr =
      row.time === null || row.time === undefined ? "" : String(row.time);
    // Google Sheets values API expects a two-dimensional array ordered by columns.
    const values = SHEET_COLUMNS.map((col) => {
      const v = row[col];
      return v === null || v === undefined ? "" : v;
    });
    const rowIndex = timeToRowIndex.get(timeStr);
    if (rowIndex !== undefined) {
      toUpdate.push({ rowIndex, values });
    } else {
      toAppend.push(values);
    }
  }

  if (toUpdate.length > 0) {
    toUpdate.sort((a, b) => a.rowIndex - b.rowIndex);
    let i = 0;
    // Adjacent updates are batched into continuous ranges to reduce API calls.
    while (i < toUpdate.length) {
      const start = toUpdate[i].rowIndex;
      const batch: unknown[][] = [];
      while (i < toUpdate.length && toUpdate[i].rowIndex === start + batch.length) {
        batch.push(toUpdate[i].values);
        i++;
      }
      const endRow = start + batch.length - 1;
      await withRateLimitRetry(() =>
        sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `'${title}'!A${start}:T${endRow}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: batch },
        })
      );
    }
  }
  if (toAppend.length > 0) {
    await withRateLimitRetry(() =>
      sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `'${title}'!A:T`,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: toAppend },
      })
    );
  }
}

/** Range cleared after daily report (data only, keep header row 1). */
export const REPORT_SHEET_CLEAR_RANGE = "A2:T";

export async function clearRange(
  spreadsheetId: string,
  sheetName: string | undefined,
  range: string,
  sheetTitle?: string
): Promise<void> {
  const auth = await getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const title = sheetTitle ?? (await getSheetTitle(spreadsheetId, sheetName));
  await withRateLimitRetry(() =>
    sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `'${title}'!${range}`,
    })
  );
}

/** Clear the report sheet data after daily report (keeps header row for performance). */
export async function clearReportSheet(
  spreadsheetId: string,
  sheetName?: string,
  sheetTitle?: string
): Promise<void> {
  await clearRange(spreadsheetId, sheetName, REPORT_SHEET_CLEAR_RANGE, sheetTitle);
}
