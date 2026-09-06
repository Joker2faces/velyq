import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { SECURITY_HEADERS, applySecurityHeaders } from "../security-headers";
import { proxy } from "../proxy";

/*
 * next.config.js's `headers()` is a Next/Vercel-only mechanism. Vinext's
 * Cloudflare build does not read it, so the deployed Worker was shipping
 * every response — including the homepage — with no CSP, no HSTS, no
 * X-Frame-Options, nothing. Observed live: `curl -I` against the production
 * Worker returned only Cloudflare's own headers.
 *
 * proxy.ts runs on every request in both runtimes, so it is the one place
 * that can actually guarantee these headers on Cloudflare. These tests pin
 * that guarantee directly, independent of which platform executes it.
 */

function request(path: string) {
  return new NextRequest(`https://velyq.test${path}`);
}

describe("security headers", () => {
  it("keeps next.config.mjs's copy (the Node/Vercel path) in sync with the canonical list", () => {
    const configPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../next.config.mjs",
    );
    const raw = readFileSync(configPath, "utf8");
    for (const [key, value] of SECURITY_HEADERS) {
      expect(raw).toContain(`key: "${key}"`);
      expect(raw.replace(/\s+/g, " ")).toContain(value.replace(/\s+/g, " "));
    }
  });

  it("attaches the full baseline to a plain response", () => {
    const response = applySecurityHeaders(new Response("ok"));
    for (const [key, value] of SECURITY_HEADERS) {
      expect(response.headers.get(key)).toBe(value);
    }
  });

  it("does not override a header a route deliberately set", () => {
    const response = applySecurityHeaders(
      new Response("ok", {
        headers: { "Content-Security-Policy": "default-src 'none'" },
      }),
    );
    expect(response.headers.get("Content-Security-Policy")).toBe(
      "default-src 'none'",
    );
  });

  it("carries the headers on a public page response from the proxy", async () => {
    const response = await proxy(request("/"));
    for (const [key, value] of SECURITY_HEADERS) {
      expect(response.headers.get(key)).toBe(value);
    }
  });

  it("carries the headers on an unauthenticated redirect to sign-in", async () => {
    process.env["VELYQ_APPLICATION_ORIGIN"] = "https://velyq.test";
    // /matches/:id is still Worker-rendered, so it is still edge-gated.
    const response = await proxy(request("/matches/abc"));
    expect(response.status).toBe(307);
    for (const [key, value] of SECURITY_HEADERS) {
      expect(response.headers.get(key)).toBe(value);
    }
  });
});
