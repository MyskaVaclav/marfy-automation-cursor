import { BROWSER_HEADERS, LOGIN_URL, VIZ_URL, CHART_DATA_URL } from "../constants.js";
import { extractTokenAndCookies, mergeIdentityCookie } from "./extract.js";
import { withTransientRetry } from "./retry.js";

export interface LoginStep1Result {
  token: string;
  cookie: string;
}

function getSetCookieHeaders(res: Response): string[] | undefined {
  // Node fetch exposes Set-Cookie differently across runtimes and versions.
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof h.getSetCookie === "function") return h.getSetCookie();
  const one = res.headers.get("set-cookie");
  return one ? [one] : undefined;
}

export async function fetchLoginPage(): Promise<{
  html: string;
  setCookie: string | string[] | undefined;
}> {
  return withTransientRetry(async () => {
    // The initial page response carries both the antiforgery token and base cookies.
    const res = await fetch(LOGIN_URL, {
      method: "GET",
      headers: { ...BROWSER_HEADERS },
      redirect: "follow",
    });
    const html = await res.text();
    const setCookie = getSetCookieHeaders(res);
    return { html, setCookie };
  });
}

export function getTokenAndCookie(
  html: string,
  setCookie: string | string[] | undefined
): LoginStep1Result {
  return extractTokenAndCookies(html, setCookie);
}

export async function postLogin(
  token: string,
  cookie: string,
  email: string,
  password: string
): Promise<{
  status: number;
  setCookie: string | string[] | undefined;
}> {
  return withTransientRetry(async () => {
    // The login form must match the ASP.NET field names expected by Marfy.
    const body = new URLSearchParams({
      "Input.Email": email,
      "Input.Password": password,
      __RequestVerificationToken: token,
      "Input.RememberMe": "false",
    });
    const res = await fetch(LOGIN_URL, {
      method: "POST",
      headers: {
        ...BROWSER_HEADERS,
        "content-type": "application/x-www-form-urlencoded",
        cookie,
      },
      body: body.toString(),
      redirect: "manual",
    });
    const setCookie = getSetCookieHeaders(res);
    return { status: res.status, setCookie };
  });
}

export function buildAuthCookie(
  baseCookie: string,
  loginSetCookie: string | string[] | undefined
): string {
  return mergeIdentityCookie(baseCookie, loginSetCookie);
}

export async function getVisualizationPage(cookie: string): Promise<void> {
  await withTransientRetry(async () => {
    // Reading the body releases the connection before the chart-data request.
    const res = await fetch(VIZ_URL, {
      method: "GET",
      headers: { ...BROWSER_HEADERS, cookie },
      redirect: "follow",
    });
    await res.text();
  });
}

export async function postChartData(
  cookie: string,
  startDt: string,
  endDt: string
): Promise<unknown> {
  return withTransientRetry(async () => {
    // The dynamic web payload mirrors the request sent by the Marfy visualization page.
    const body = JSON.stringify({
      dynamicWebId: "4279",
      conditions: {
        appliedFilters: {},
        useIdealGrouping: true,
        rangeId: "1",
        dateRangeType: 1,
        startDt,
        endDt,
        useCustomYMDSettings: false,
        lastYears: false,
        lastMonths: false,
        lastDays: false,
      },
    });
    const res = await fetch(CHART_DATA_URL, {
      method: "POST",
      headers: {
        ...BROWSER_HEADERS,
        "content-type": "application/json; charset=UTF-8",
        cookie,
      },
      body,
    });
    if (!res.ok) throw new Error(`GetChartData failed: ${res.status} ${res.statusText}`);
    return res.json() as Promise<unknown>;
  });
}
