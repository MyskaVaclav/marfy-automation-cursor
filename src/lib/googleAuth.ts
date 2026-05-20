/**
 * Build Google Auth options from environment variables.
 *
 * Supported modes:
 * - GOOGLE_APPLICATION_CREDENTIALS: path to a service account JSON file
 * - GOOGLE_CREDENTIALS_BASE64: base64-encoded service account JSON (useful in CI)
 */
export function getGoogleAuthOptions(): { keyFile: string } | { credentials: object } {
  const base64 = process.env.GOOGLE_CREDENTIALS_BASE64;
  if (base64 && base64.trim() !== "") {
    try {
      const json = Buffer.from(base64.trim(), "base64").toString("utf8");
      const credentials = JSON.parse(json) as object;
      return { credentials };
    } catch (e) {
      throw new Error(
        "GOOGLE_CREDENTIALS_BASE64 is set but invalid (must be base64-encoded JSON): " +
          (e instanceof Error ? e.message : String(e))
      );
    }
  }
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyFile || keyFile.trim() === "")
    throw new Error(
      "Set GOOGLE_APPLICATION_CREDENTIALS (path to JSON) or GOOGLE_CREDENTIALS_BASE64 (base64-encoded JSON)"
    );
  return { keyFile: keyFile.trim() };
}
