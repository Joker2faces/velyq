import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLIC_ROUTES } from "../../../tooling/scripts/public-routes.mjs";
import { SECURITY_HEADERS } from "../security-headers";

/*
 * Public pages are prerendered into the Cloudflare asset directory so the
 * Worker is never invoked to serve them. That is what keeps the site inside
 * the Workers Free 10ms CPU allowance — serving this app's SSR from the
 * Worker exhausted it and returned 503 for every HTML route.
 *
 * Two things can quietly undo that, and both are guarded here: putting an
 * authenticated route into the prerender list (a static file is byte-identical
 * for every visitor, so it would hand one customer's page to the next), and
 * letting the static security headers drift from the dynamic ones.
 */

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const AUTHENTICATED_ROUTES = [
  "/today",
  "/edge",
  "/radar",
  "/account",
  "/matches",
];

describe("static public site", () => {
  it("never prerenders an authenticated route", () => {
    for (const route of PUBLIC_ROUTES) {
      for (const guarded of AUTHENTICATED_ROUTES) {
        expect(route === guarded || route.startsWith(`${guarded}/`)).toBe(
          false,
        );
      }
    }
  });

  it("never prerenders an API route", () => {
    for (const route of PUBLIC_ROUTES) {
      expect(route.startsWith("/api")).toBe(false);
    }
  });

  it("refuses to write a page carrying customer state", () => {
    /*
     * The prerender step checks each rendered page against this list before
     * writing it. If the guard is ever removed, a personalised page could be
     * frozen into a public asset.
     */
    const script = readFileSync(
      path.join(repoRoot, "tooling/scripts/prerender-public-routes.mjs"),
      "utf8",
    );
    expect(script).toContain("velyq_access_token");
    expect(script).toContain("velyq_refresh_token");
    expect(script).toMatch(/refused, contains/);
  });

  it("verifies the rendered language before writing a locale variant", () => {
    const script = readFileSync(
      path.join(repoRoot, "tooling/scripts/prerender-public-routes.mjs"),
      "utf8",
    );
    // A Greek asset containing English would silently serve the wrong
    // language to every Greek visitor, with no request-time fallback.
    expect(script).toContain('lang="${code}"');
  });

  it("gives statically served pages the same security headers as dynamic ones", () => {
    const script = readFileSync(
      path.join(repoRoot, "tooling/scripts/static-headers.mjs"),
      "utf8",
    );
    // The generator reads the canonical list rather than restating it, so the
    // two delivery paths cannot drift apart.
    expect(script).toContain("security-headers.ts");
    expect(SECURITY_HEADERS.length).toBeGreaterThanOrEqual(6);
  });

  it("keeps the Worker as the fallback, so unmatched paths still reach it", () => {
    const config = readFileSync(
      path.join(repoRoot, "apps/web/wrangler.jsonc"),
      "utf8",
    );
    // Without this, a path with no asset would 404 at the edge and the API,
    // the authenticated routes and the branded 404 would all stop working.
    expect(config).toContain('"not_found_handling": "none"');
    // Canonical URLs: /pricing must serve, not redirect to /pricing/.
    expect(config).toContain('"html_handling": "drop-trailing-slash"');
  });
});
