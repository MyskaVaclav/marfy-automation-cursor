import { env, validateEnv } from "./env.js";
import {
  fetchLoginPage,
  getTokenAndCookie,
  postLogin,
  buildAuthCookie,
  getVisualizationPage,
  postChartData,
} from "./lib/http.js";
import { chartDataToRows, type DataRow } from "./lib/chartToRows.js";
import { appendOrUpdate, getSheetTitle } from "./lib/sheets.js";
import { createRunLogger } from "./lib/runLogger.js";

interface IngestWindow {
  startDt: string;
  endDt: string;
}

function logStep(step: string, ms: number): void {
  console.log(`[ingest30m] ${step}: ${ms}ms`);
}

async function runWithLog<T>(
  logger: ReturnType<typeof createRunLogger>,
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  // Measure each external or transformation step for both stdout and JSONL logs.
  const t = Date.now();
  try {
    const result = await fn();
    logger.logOp(name, Date.now() - t, true);
    logStep(name, Date.now() - t);
    return result;
  } catch (err) {
    logger.logOp(name, Date.now() - t, false, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

async function runIngest30mAttempt(
  logger: ReturnType<typeof createRunLogger>,
  spreadsheetId: string,
  sheetName: string | undefined,
  email: string,
  password: string,
  window: IngestWindow
): Promise<void> {
  // Marfy requires the antiforgery token and base cookies from the login page.
  const authCookie = await runWithLog(logger, "1_fetch_and_submit_login", async () => {
    const { html, setCookie } = await fetchLoginPage();
    const { token, cookie: baseCookie } = getTokenAndCookie(html, setCookie);
    const { setCookie: loginSetCookie } = await postLogin(
      token,
      baseCookie,
      email,
      password
    );
    return buildAuthCookie(baseCookie, loginSetCookie);
  });

  await runWithLog(logger, "2_warmup_page", () => getVisualizationPage(authCookie));

  const chartRaw = await runWithLog(logger, "3_fetch_chart_data", () =>
    postChartData(authCookie, window.startDt, window.endDt)
  );

  const rows = await runWithLog(logger, "4_chart_to_rows", () =>
    Promise.resolve(
      chartDataToRows(
        chartRaw as {
          labelsData?: number[];
          dictData?: Record<string, (number | null)[]>;
        }
      )
    )
  );

  // Sheets writes use the canonical sheet title to avoid repeated metadata lookups.
  await runWithLog(logger, "5_sheets_upsert", async () => {
    const sheetTitle = await getSheetTitle(spreadsheetId, sheetName);
    await appendOrUpdate(spreadsheetId, sheetName, rows as DataRow[], sheetTitle);
  });
}

/**
 * Ingest the last 30 minutes of Marfy chart data into Google Sheets.
 *
 * Side effects: HTTP requests to Marfy, Google Sheets API writes, stdout logging,
 * and JSONL run logging via `logs/runs.log`.
 */
export async function runIngest30m(): Promise<void> {
  validateEnv("ingest30m");
  const spreadsheetId = env.sheetsId();
  const sheetName = env.sheetName() ?? undefined;
  const email = env.marfyEmail();
  const password = env.marfyPassword();
  const now = new Date();
  // The ingest job always requests the latest 30-minute chart window.
  const window: IngestWindow = {
    startDt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
    endDt: now.toISOString(),
  };

  const logger1 = createRunLogger("ingest30m");

  try {
    await runIngest30mAttempt(logger1, spreadsheetId, sheetName, email, password, window);
    const totalMs = logger1.operations.reduce((sum, op) => sum + op.ms, 0);
    logStep("total", totalMs);
    await logger1.finish(totalMs, true);
  } catch (err) {
    const totalMs1 = logger1.operations.reduce((sum, op) => sum + op.ms, 0);
    await logger1.finish(totalMs1, false);
    console.warn(`[ingest30m] First attempt failed, retrying in 10 minutes...`);
    await new Promise((resolve) => setTimeout(resolve, 10 * 60 * 1000));
    // Retry as a separate run so the failed and retried attempts are logged independently.
    const logger2 = createRunLogger("ingest30m");
    try {
      await runIngest30mAttempt(logger2, spreadsheetId, sheetName, email, password, window);
      const totalMs2 = logger2.operations.reduce((sum, op) => sum + op.ms, 0);
      logStep("total", totalMs2);
      await logger2.finish(totalMs2, true);
    } catch (retryErr) {
      const totalMs2 = logger2.operations.reduce((sum, op) => sum + op.ms, 0);
      await logger2.finish(totalMs2, false);
      throw retryErr;
    }
  }
}
