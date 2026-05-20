/**
 * Extract __RequestVerificationToken from login page HTML.
 */
export function extractAntiforgeryToken(html: string): string {
  const m = html.match(
    /<input[^>]+name="__RequestVerificationToken"[^>]+value="([^"]+)"/i
  );
  if (!m) throw new Error("RequestVerificationToken NOT FOUND in HTML");
  return m[1];
}

/**
 * From Set-Cookie header(s), keep only Session and Antiforgery, return Cookie header value.
 */
export function extractBaseCookies(setCookie: string | string[] | undefined): string {
  const arr = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const parts: string[] = [];
  for (const h of arr) {
    for (const raw of h.split(",")) {
      const c = raw.trim();
      if (
        c.startsWith(".AspNetCore.Session=") ||
        c.startsWith(".AspNetCore.Antiforgery.")
      ) {
        parts.push(c.split(";")[0]);
      }
    }
  }
  if (parts.length < 2) throw new Error("Missing Session or Antiforgery cookie");
  return parts.join("; ");
}

/**
 * From login POST response Set-Cookie, find Identity cookie and return full Cookie header.
 */
export function mergeIdentityCookie(
  baseCookie: string,
  setCookie: string | string[] | undefined
): string {
  const arr = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  for (const h of arr) {
    for (const raw of h.split(",")) {
      const c = raw.trim().split(";")[0];
      if (c.startsWith(".AspNetCore.Identity.Application=")) {
        return `${baseCookie}; ${c}`;
      }
    }
  }
  throw new Error("Identity cookie not found - login failed");
}

export interface LoginPageResult {
  token: string;
  cookie: string;
}

export function extractTokenAndCookies(
  html: string,
  setCookie: string | string[] | undefined
): LoginPageResult {
  return {
    token: extractAntiforgeryToken(html),
    cookie: extractBaseCookies(setCookie),
  };
}
