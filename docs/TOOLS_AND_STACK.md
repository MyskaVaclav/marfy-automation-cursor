# Tools and stack

Overview of the technologies, libraries, and external services this codebase uses.

---

## Runtime and language

| Tool | Role |
|------|------|
| **Node.js** (≥ 18) | Runtime. Uses native `fetch`, ES modules, `fs/promises`, `stream`. |
| **TypeScript** (5.x) | Typed source; compiled to JavaScript in `dist/` with `tsc`. |
| **ES modules** | `"type": "module"`; `import`/`export`, `.js` extensions in imports. |

---

## npm dependencies (production)

| Package | Purpose |
|---------|---------|
| **dotenv** | Loads `.env` into `process.env` at startup. |
| **googleapis** | Google Sheets API (read, append, update, clear) and Google Drive API (upload file). Auth via service account or base64 credentials. |
| **nodemailer** | Sends the daily report email with PDF attachment via SMTP. |
| **puppeteer** | Headless Chromium: renders report HTML and generates PDF (A4, margins). |
| **safe-buffer** | Used by `google-auth-library` (via `jwa`/`jws`) for Buffer handling; required for Google auth to work. |

---

## npm dependencies (dev)

| Package | Purpose |
|---------|---------|
| **typescript** | Compiler for `.ts` → `.js`. |
| **@types/node** | TypeScript types for Node.js built-ins. |
| **@types/nodemailer** | TypeScript types for nodemailer. |

---

## External services and APIs

| Service | Usage |
|---------|--------|
| **Marfy (HTTP)** | Login page GET, login POST (cookie + antiforgery token), visualization page GET, chart data POST (JSON). Base URL and endpoints are in `constants.ts`. |
| **Google Sheets API** | Read all rows, append/update by `time`, clear range `A2:T`. Uses spreadsheet ID and optional sheet name from env. |
| **Google Drive API** | Upload PDF to a folder (My Drive or Shared Drive). Uses folder ID from env; `supportsAllDrives: true`. |
| **SMTP** | Sending the daily report email (To, Subject, PDF attachment). Config via env (host, port, user, pass). |

---

## Node.js built-ins used

| Module / global | Use |
|-----------------|-----|
| **fetch** | All HTTP to Marfy (login, viz, chart data). No extra HTTP client. |
| **fs/promises** | `mkdir` (logs dir), `appendFile` (append to `logs/runs.log`). |
| **stream** | `Readable.from(buffer)` for Drive upload body. |
| **path** | `join` for log file path. |
| **process** | `process.env`, `process.argv`, `process.exit`. |

---

## Auth and configuration

| Mechanism | Where |
|-----------|--------|
| **Environment variables** | All config and secrets (see `.env.example`): Marfy login, Sheet ID, Drive folder, SMTP, Google credentials (path or base64). |
| **Google service account** | Sheets and Drive: either `GOOGLE_APPLICATION_CREDENTIALS` (path to JSON) or `GOOGLE_CREDENTIALS_BASE64` (base64-encoded JSON). No OAuth UI. |

---

## CLI and scripts

| Command | What runs |
|---------|-----------|
| `npm run build` | `tsc` – compile TypeScript to `dist/`. |
| `npm run ingest30m` | `node dist/cli.js ingest30m` – 30‑minute ingest pipeline. |
| `npm run dailyReport` | `node dist/cli.js dailyReport` – daily report pipeline. |
| `npm run clearSheet` | `node dist/cli.js clearSheet` – clear sheet data only. |
| `npm run test` | Build then `node dist/test/harness.js` – small unit-style harness. |

---

## Summary table

| Category | Tools |
|----------|--------|
| **Runtime** | Node.js 18+ |
| **Language** | TypeScript (compiled to JS) |
| **HTTP** | Native `fetch` |
| **Google** | googleapis (Sheets + Drive) |
| **Email** | nodemailer (SMTP) |
| **PDF** | puppeteer (HTML → PDF) |
| **Config** | dotenv + `process.env` |
| **Logging** | Custom file logger → `logs/runs.log` (JSONL) |
