import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * On Cloudflare/Vinext the not-found boundary renders with a cookie store
 * that comes back empty even though the request carried a cookie, so every
 * 404 was served in English — content and `<html lang>` alike — to Greek
 * visitors, while every other route localised correctly. Reading the raw
 * `cookie` header when the store yields nothing covers that path.
 */

const requestState = vi.hoisted(() => ({
  cookieStore: null as string | null,
  cookieHeader: null as string | null,
  headersThrow: false,
  headersCalls: 0,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      requestState.cookieStore
        ? { name, value: requestState.cookieStore }
        : undefined,
  }),
  headers: async () => {
    requestState.headersCalls += 1;
    if (requestState.headersThrow) throw new Error("no request context");
    return {
      get: (name: string) =>
        name === "cookie" ? requestState.cookieHeader : null,
    };
  },
}));

afterEach(() => {
  requestState.cookieStore = null;
  requestState.cookieHeader = null;
  requestState.headersThrow = false;
  requestState.headersCalls = 0;
  vi.resetModules();
});

async function getLocale() {
  const { getLocale } = await import("../app/locale");
  return getLocale();
}

async function getNotFoundLocale() {
  const { getNotFoundLocale } = await import("../app/locale");
  return getNotFoundLocale();
}

describe("locale resolution", () => {
  it("prefers the cookie store when it has the value", async () => {
    requestState.cookieStore = "el";
    expect(await getLocale()).toBe("el");
  });

  /*
   * The hot path must never touch headers(): doing so pushed ordinary page
   * renders past the Workers 10ms CPU limit and 503'd the whole site.
   */
  it("never reads headers() on the hot path, whatever the cookie state", async () => {
    requestState.cookieHeader = "velyq-locale=el";
    expect(await getLocale()).toBe("en");
    expect(requestState.headersCalls).toBe(0);
  });

  it("falls back to the raw cookie header on the not-found path", async () => {
    requestState.cookieHeader = "foo=1; velyq-locale=el; bar=2";
    expect(await getNotFoundLocale()).toBe("el");
  });

  it("handles the locale cookie being the only one present", async () => {
    requestState.cookieHeader = "velyq-locale=el";
    expect(await getNotFoundLocale()).toBe("el");
  });

  it("prefers the store over the header when both are present", async () => {
    requestState.cookieStore = "en";
    requestState.cookieHeader = "velyq-locale=el";
    expect(await getNotFoundLocale()).toBe("en");
    expect(requestState.headersCalls).toBe(0);
  });

  it("defaults to English when neither source has it", async () => {
    requestState.cookieHeader = "other=value";
    expect(await getNotFoundLocale()).toBe("en");
  });

  it("defaults to English rather than throwing with no request context", async () => {
    requestState.headersThrow = true;
    expect(await getNotFoundLocale()).toBe("en");
  });

  it("ignores an unrecognised locale value from either source", async () => {
    requestState.cookieStore = "de";
    expect(await getLocale()).toBe("en");
    vi.resetModules();
    requestState.cookieStore = null;
    requestState.cookieHeader = "velyq-locale=de";
    expect(await getNotFoundLocale()).toBe("en");
  });
});
