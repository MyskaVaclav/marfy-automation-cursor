# BESS Telemetry Report Automation

This application collects BESS telemetry data from the Marfy web interface,
normalizes the chart response into tabular rows, stores the data in Google
Sheets, evaluates daily operating limits, generates a PDF report, sends it by
email, and backs it up to Google Drive.

The project was created as a TypeScript/Node.js implementation for a
bachelor's thesis.

The project is intentionally implemented as a small CLI application. Runtime
configuration and credentials are loaded from environment variables, while the
compiled JavaScript entry point is `dist/cli.js`.

## Requirements

- Node.js 18 or newer
- Google Cloud service account with access to Google Sheets and Google Drive
- Spreadsheet shared with the service account
- SMTP credentials for sending the daily report
- Marfy account credentials for the ingestion job

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env` from `.env.example` and fill in the required values.

3. Build the TypeScript sources:

   ```bash
   npm run build
   ```

## Configuration

All secrets and deployment-specific values are read from the environment. The
application supports Google authentication either by path to a service account
JSON file or by base64-encoded service account JSON.

| Variable | Required for | Description |
| --- | --- | --- |
| `MARFY_EMAIL` | `ingest30m` | Login email for Marfy. |
| `MARFY_PASSWORD` | `ingest30m` | Login password for Marfy. |
| `SHEETS_ID` | all jobs | Google Spreadsheet ID. |
| `SHEET_NAME` | optional | Sheet tab name. If omitted, the first tab is used. |
| `GOOGLE_APPLICATION_CREDENTIALS` | all jobs | Path to the Google service account JSON file. |
| `GOOGLE_CREDENTIALS_BASE64` | all jobs | Base64-encoded Google service account JSON. Used instead of `GOOGLE_APPLICATION_CREDENTIALS` when set. |
| `REPORT_TO_EMAIL` | `dailyReport` | Recipient of the generated PDF report. |
| `DRIVE_FOLDER_ID` | `dailyReport` | Google Drive folder where the PDF backup is uploaded. |
| `SMTP_HOST` | `dailyReport` | SMTP server host. |
| `SMTP_PORT` | `dailyReport` | SMTP server port. Defaults to `587` if the value cannot be parsed. |
| `SMTP_USER` | `dailyReport` | SMTP username. |
| `SMTP_PASS` | `dailyReport` | SMTP password. |
| `CLEAR_SHEET` | optional | Set to `false`, `0`, or `no` to keep sheet data after the daily report. By default the data range is cleared. |

No credentials are hardcoded in the repository.

## Commands

| Command | Description |
| --- | --- |
| `npm run build` | Compile TypeScript from `src/` to `dist/`. |
| `npm run ingest30m` | Run the 30-minute ingestion job. |
| `npm run dailyReport` | Generate, send, and back up the daily report. |
| `npm run clearSheet` | Clear the report sheet data range without generating a report. |
| `npm run test` | Build the project and run the small test harness. |

The compiled CLI can also be called directly:

```bash
node dist/cli.js ingest30m
node dist/cli.js dailyReport
node dist/cli.js clearSheet
```

## ingest30m

The `ingest30m` job downloads data for the last 30 minutes and writes it
to Google Sheets.

1. Validate required environment variables.
2. Fetch the Marfy login page.
3. Extract the antiforgery token and base cookies.
4. Submit the login form and build the authenticated cookie header.
5. Open the visualization page as a warm-up request.
6. Request chart data for the interval from `now - 30 minutes` to `now`.
7. Convert `labelsData` and `dictData` from the chart response to row objects.
8. Upsert the rows into Google Sheets by the `time` column.

The chart response is transformed by `chartDataToRows()`. Each output row is a
`DataRow` object with an ISO timestamp in `time` and metric columns derived from
the element ID mapping in `constants.ts`.

Before the Google Sheets API call, `appendOrUpdate()` maps each object row to an
array of cell values in the fixed order defined by `SHEET_COLUMNS`. Empty
`null` or `undefined` values are written as empty strings.

If the first ingestion attempt fails, the job writes a failed run log, waits 10
minutes, and performs one retry with a new run logger.

## dailyReport

The `dailyReport` job reads the accumulated sheet data, evaluates the previous
local day, and sends the generated PDF report.

1. Validate required environment variables.
2. Read all rows from Google Sheets with `readAllRows()`.
3. Convert the sheet header and value rows to object records keyed by column
   name.
4. Evaluate the previous Prague-time day with `evaluateDaily()`.
5. Render the evaluation result to HTML.
6. Convert the HTML report to PDF with Puppeteer.
7. Send the PDF by email using SMTP.
8. Upload the same PDF to Google Drive.
9. Clear the data range `A2:T` unless `CLEAR_SHEET` disables this step.

The evaluated time window is computed inside `evaluateDaily()` with native
`Date` and helper functions in `evaluator.ts`. The function filters rows by the
`time` column to the previous Prague-time day and sorts the selected rows by
timestamp before evaluating configured limits and violations.

The generated email subject is `Report BESS YYYY-MM-DD`; the Drive file name is
`Report YYYY-MM-DD.pdf`.

## Google Sheets Behavior

Sheet communication is implemented with the `googleapis` package and Google
service account authentication.

The ingestion job writes to the sheet through `appendOrUpdate()`:

- Existing sheet data is read from range `A:T`.
- If the sheet is empty, the header row is created from `SHEET_COLUMNS`.
- Existing rows are indexed by the value in the `time` column.
- Rows with an existing `time` value are updated in place.
- Rows with a new `time` value are appended with `INSERT_ROWS`.

The report job reads the same range through `readAllRows()`. The first row
is treated as the header and the remaining rows are returned as object records.
Empty cells are represented as `null`.

## Logging

Each job prints step timings to standard output. The message format is:

```text
[ingest30m] 1_fetch_and_submit_login: 234ms
[ingest30m] 2_warmup_page: 120ms
[ingest30m] total: 354ms
```

or:

```text
[dailyReport] 1_read_sheet: 450ms
[dailyReport] 2_evaluate: 12ms
[dailyReport] total: 15234ms
```

Structured run logs are appended to `logs/runs.log`. The directory is created
automatically. Each completed run writes one JSON object on a separate line
(JSONL) with the following fields:

- `job`: `ingest30m`, `dailyReport`, or `clearSheet`
- `startedAt` and `finishedAt`: ISO timestamps
- `totalMs`: total runtime in milliseconds
- `success`: whether the run completed without throwing
- `operations`: per-step records with `name`, `ms`, `success`, and optional
  `error`

Example entry, formatted for readability:

```json
{
  "job": "dailyReport",
  "startedAt": "2026-02-07T12:00:00.000Z",
  "finishedAt": "2026-02-07T12:00:15.234Z",
  "totalMs": 15234,
  "success": true,
  "operations": [
    { "name": "1_read_sheet", "ms": 450, "success": true },
    { "name": "2_evaluate", "ms": 12, "success": true }
  ]
}
```

## Tests

Run the test harness with:

```bash
npm run test
```

The `pretest` script builds the project before the tests run. The harness covers
core transformations such as token and cookie extraction, chart response to row
mapping, and daily window filtering.

## License

For thesis use only.
