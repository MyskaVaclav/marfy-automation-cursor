import { env, validateEnv } from "./env.js";
import { readAllRows, clearReportSheet, getSheetTitle } from "./lib/sheets.js";
import { evaluateDaily, yesterdayDateStr } from "./lib/evaluator.js";
import { renderReportHtml } from "./lib/reportHtml.js";
import { htmlToPdf } from "./lib/pdf.js";
import { sendReportEmail } from "./lib/email.js";
import { uploadToDrive } from "./lib/drive.js";
import { createRunLogger } from "./lib/runLogger.js";

function logStep(step: string, ms: number): void {
  console.log(`[dailyReport] ${step}: ${ms}ms`);
}

async function runWithLog<T>(
  logger: ReturnType<typeof createRunLogger>,
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  // Keep the report pipeline measurable without mixing timing code into each step.
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

/**
 * Generate and distribute the daily compliance report.
 *
 * Side effects: reads from Google Sheets, generates a PDF via Puppeteer, sends an
 * email via SMTP, uploads to Google Drive, optionally clears the sheet data
 * range, writes JSONL run logs, and prints step timings to stdout.
 */
export async function runDailyReport(): Promise<void> {
  validateEnv("dailyReport");
  const spreadsheetId = env.sheetsId();
  const sheetName = env.sheetName() ?? undefined;
  const toEmail = env.reportToEmail();
  const driveFolderId = env.driveFolderId();
  const smtp = env.smtp();
  const dateStr = yesterdayDateStr();
  const subject = `Report BESS ${dateStr}`;
  const filename = `Report ${dateStr}.pdf`;

  const t0 = Date.now();
  const logger = createRunLogger("dailyReport");

  try {
    // Resolve the title once and pass it through read/clear calls to avoid duplicate metadata reads.
    const sheetTitle = await getSheetTitle(spreadsheetId, sheetName);
    const rows = await runWithLog(logger, "1_read_sheet", () =>
      readAllRows(spreadsheetId, sheetName, sheetTitle)
    );

    const result = await runWithLog(logger, "2_evaluate", () =>
      Promise.resolve(evaluateDaily(rows))
    );

    if (!result.ok) {
      // Evaluation failures are logged as failed runs before the process exits.
      console.error(JSON.stringify(result, null, 2));
      logger.logOp("2_evaluate", 0, false, result.error ?? "Evaluation failed");
      await logger.finish(Date.now() - t0, false);
      throw new Error(result.error ?? "Evaluation failed");
    }

    const html = await runWithLog(logger, "3_render_html", () =>
      Promise.resolve(renderReportHtml(result))
    );

    const pdfBuffer = await runWithLog(logger, "4_html_to_pdf", () => htmlToPdf(html));

    await runWithLog(logger, "5_send_email", () =>
      sendReportEmail(smtp, toEmail, subject, pdfBuffer, filename)
    );

    await runWithLog(logger, "6_backup_drive", () =>
      uploadToDrive(driveFolderId, filename, pdfBuffer, "application/pdf")
    );

    if (env.clearSheetEnabled()) {
      // The header row is preserved; only collected data rows are cleared.
      await runWithLog(logger, "7_clear_sheet", () =>
        clearReportSheet(spreadsheetId, sheetName, sheetTitle)
      );
    } else {
      logger.logOp("7_clear_sheet", 0, true);
      logStep("7_clear_sheet", 0);
      console.log("[dailyReport] 7_clear_sheet: skipped (CLEAR_SHEET=false)");
    }

    logStep("total", Date.now() - t0);
    await logger.finish(Date.now() - t0, true);
  } catch (err) {
    await logger.finish(Date.now() - t0, false);
    throw err;
  }
}

/** Clear the report sheet only (for performance / manual reset). */
export async function runClearSheet(): Promise<void> {
  validateEnv("clearSheet");
  const spreadsheetId = env.sheetsId();
  const sheetName = env.sheetName() ?? undefined;
  const t0 = Date.now();
  const logger = createRunLogger("clearSheet");
  try {
    await runWithLog(logger, "clear", () => clearReportSheet(spreadsheetId, sheetName));
    console.log(`[clearSheet] done: ${Date.now() - t0}ms`);
    await logger.finish(Date.now() - t0, true);
  } catch (err) {
    await logger.finish(Date.now() - t0, false);
    throw err;
  }
}
