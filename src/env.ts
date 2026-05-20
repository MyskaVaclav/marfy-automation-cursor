import { config } from "dotenv";

config();

const required = (key: string): string => {
  const v = process.env[key];
  if (v === undefined || v === "") throw new Error(`Missing required env: ${key}`);
  return v;
};

const optional = (key: string): string | undefined => process.env[key];

const falsy = (key: string): boolean => {
  const v = (process.env[key] ?? "").toLowerCase();
  return v === "false" || v === "0" || v === "no";
};

export function validateEnv(job: "ingest30m" | "dailyReport" | "clearSheet"): void {
  if (job === "ingest30m") {
    required("MARFY_EMAIL");
    required("MARFY_PASSWORD");
    required("SHEETS_ID");
    const creds = optional("GOOGLE_APPLICATION_CREDENTIALS");
    const base64 = optional("GOOGLE_CREDENTIALS_BASE64");
    if (!creds && !base64) throw new Error("Missing GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_CREDENTIALS_BASE64 for Sheets");
  } else if (job === "clearSheet") {
    required("SHEETS_ID");
    const creds = optional("GOOGLE_APPLICATION_CREDENTIALS");
    const base64 = optional("GOOGLE_CREDENTIALS_BASE64");
    if (!creds && !base64) throw new Error("Missing GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_CREDENTIALS_BASE64");
  } else {
    required("SHEETS_ID");
    required("REPORT_TO_EMAIL");
    required("DRIVE_FOLDER_ID");
    const creds = optional("GOOGLE_APPLICATION_CREDENTIALS");
    const base64 = optional("GOOGLE_CREDENTIALS_BASE64");
    if (!creds && !base64) throw new Error("Missing GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_CREDENTIALS_BASE64");
    required("SMTP_HOST");
    required("SMTP_PORT");
    required("SMTP_USER");
    required("SMTP_PASS");
  }
}

export const env = {
  marfyEmail: () => required("MARFY_EMAIL"),
  marfyPassword: () => required("MARFY_PASSWORD"),
  sheetsId: () => required("SHEETS_ID"),
  sheetName: () => optional("SHEET_NAME"),
  reportToEmail: () => required("REPORT_TO_EMAIL"),
  driveFolderId: () => required("DRIVE_FOLDER_ID"),
  googleCreds: () =>
    process.env.GOOGLE_CREDENTIALS_BASE64?.trim()
      ? "(base64)"
      : required("GOOGLE_APPLICATION_CREDENTIALS"),
  smtp: () => ({
    host: required("SMTP_HOST"),
    port: Number(process.env.SMTP_PORT) || 587,
    user: required("SMTP_USER"),
    pass: required("SMTP_PASS"),
  }),
  /** If false, dailyReport will skip clearing the sheet after sending. Set CLEAR_SHEET=false to disable. Default: true. */
  clearSheetEnabled: () => !falsy("CLEAR_SHEET"),
};
