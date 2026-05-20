import { mkdir, appendFile } from "fs/promises";
import { join } from "path";

const LOGS_DIR = "logs";
const RUNS_FILE = "runs.log";

export interface LogOperation {
  name: string;
  ms: number;
  success: boolean;
  error?: string;
}

export interface RunLogEntry {
  job: string;
  startedAt: string;
  finishedAt: string;
  totalMs: number;
  success: boolean;
  operations: LogOperation[];
}

function ensureLogsDir(): Promise<void> {
  return mkdir(LOGS_DIR, { recursive: true }).then(() => {});
}

function getRunsPath(): string {
  return join(LOGS_DIR, RUNS_FILE);
}

export function createRunLogger(job: string) {
  const startedAt = new Date().toISOString();
  // Operations stay in memory until finish() writes one JSONL entry for the run.
  const operations: LogOperation[] = [];

  return {
    get operations(): LogOperation[] {
      return operations;
    },
    logOp(name: string, ms: number, success: boolean, error?: string): void {
      operations.push({
        name,
        ms,
        success,
        ...(error !== undefined && { error: error.slice(0, 500) }),
      });
    },
    async finish(totalMs: number, success: boolean): Promise<void> {
      await ensureLogsDir();
      // One line per run keeps the file append-only and easy to process as JSONL.
      const entry: RunLogEntry = {
        job,
        startedAt,
        finishedAt: new Date().toISOString(),
        totalMs,
        success,
        operations,
      };
      const line = JSON.stringify(entry) + "\n";
      await appendFile(getRunsPath(), line);
    },
  };
}
