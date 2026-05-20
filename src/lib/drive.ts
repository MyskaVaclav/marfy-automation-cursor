import { Readable } from "stream";
import { google } from "googleapis";
import { getGoogleAuthOptions } from "./googleAuth.js";
import { withTransientRetry } from "./retry.js";

let _auth: Awaited<ReturnType<typeof google.auth.GoogleAuth.prototype.getClient>>;

async function getAuth() {
  // Reuse the Drive auth client for all uploads in the same process.
  if (_auth) return _auth;
  const opts = getGoogleAuthOptions();
  const auth = new google.auth.GoogleAuth({
    ...opts,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });
  _auth = (await auth.getClient()) as typeof _auth;
  return _auth;
}

/**
 * Upload a file to a Google Drive folder (works for My Drive and Shared Drives).
 *
 * Side effects: network I/O (Google Drive API).
 * Retries: transient API failures are retried by withTransientRetry().
 */
export async function uploadToDrive(
  folderId: string,
  filename: string,
  buffer: Buffer,
  mimeType: string
): Promise<void> {
  await withTransientRetry(async () => {
    const auth = await getAuth();
    const drive = google.drive({ version: "v3", auth });
    await drive.files.create({
      supportsAllDrives: true,
      requestBody: {
        name: filename,
        parents: [folderId],
      },
      media: {
        mimeType,
        body: Readable.from(buffer),
      },
    });
  });
}
