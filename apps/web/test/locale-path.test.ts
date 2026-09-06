import { describe, expect, it } from "vitest";
import {
  STATIC_PUBLIC_ROUTES,
  localeCounterpart,
  localePath,
} from "../app/locale-path";
import { PUBLIC_ROUTES } from "../../../tooling/scripts/public-routes.mjs";

/*
 * Public pages are prerendered as static assets, so the locale cannot come
 * from a cookie — a static file is byte-identical for everyone who asks for
 * it. Greek therefore lives under /el. If a link on a Greek page points at
 * the canonical path, the visitor is silently dropped back into English,
 * which is exactly the regression these pin.
 */

describe("locale path", () => {
  it("leaves English on the canonical paths", () => {
    for (const route of STATIC_PUBLIC_ROUTES) {
      expect(localePath(route, "en")).toBe(route);
    }
  });

  it("moves Greek under /el", () => {
    expect(localePath("/", "el")).toBe("/el/");
    expect(localePath("/pricing", "el")).toBe("/el/pricing");
    expect(localePath("/terms", "el")).toBe("/el/terms");
    expect(localePath("/sign-in", "el")).toBe("/el/sign-in");
  });

  it("keeps fragments and queries attached", () => {
    expect(localePath("/#modules", "el")).toBe("/el/#modules");
    expect(localePath("/sign-in?error=invalid", "el")).toBe(
      "/el/sign-in?error=invalid",
    );
  });

  it("leaves routes that have no Greek variant alone", () => {
    // Authenticated routes are still Worker-rendered and read the cookie.
    for (const route of ["/today", "/edge", "/radar", "/account"]) {
      expect(localePath(route, "el")).toBe(route);
    }
    // The API has no locale at all.
    expect(localePath("/api/v1/today", "el")).toBe("/api/v1/today");
  });

  it("never rewrites an external or protocol-relative link", () => {
    expect(localePath("https://example.test/pricing", "el")).toBe(
      "https://example.test/pricing",
    );
    expect(localePath("//example.test/pricing", "el")).toBe(
      "//example.test/pricing",
    );
  });

  it("maps a page to its counterpart in the other language", () => {
    expect(localeCounterpart("/pricing", "el")).toBe("/el/pricing");
    expect(localeCounterpart("/el/pricing", "en")).toBe("/pricing");
    expect(localeCounterpart("/el", "en")).toBe("/");
    expect(localeCounterpart("/", "el")).toBe("/el/");
  });

  it("leaves an authenticated page where it is when switching language", () => {
    // /el/today does not exist; the cookie still drives those renders.
    expect(localeCounterpart("/today", "el")).toBe("/today");
  });

  /*
   * The app and the build step must agree on exactly which routes exist in
   * both languages — a route prerendered but not linked is unreachable, and a
   * route linked but not prerendered is a 404.
   */
  it("matches the route list the prerender step actually writes", () => {
    expect([...STATIC_PUBLIC_ROUTES].sort()).toEqual([...PUBLIC_ROUTES].sort());
  });
});
