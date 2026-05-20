#!/usr/bin/env node
import { runIngest30m } from "./ingest30m.js";
import { runDailyReport, runClearSheet } from "./dailyReport.js";

/**
 * Minimal CLI entry point.
 *
 * Jobs:
 * - ingest30m: ingest the last 30 minutes into Google Sheets
 * - dailyReport: generate and distribute the daily PDF report
 * - clearSheet: clear the sheet data range (keeps header)
 */
const job = process.argv[2];
if (job === "ingest30m") {
  runIngest30m().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (job === "dailyReport") {
  runDailyReport().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (job === "clearSheet") {
  runClearSheet().catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else {
  console.error("Usage: node cli.js ingest30m | dailyReport | clearSheet");
  process.exit(1);
}
