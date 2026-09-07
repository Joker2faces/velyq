import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getConfiguredAdminUrl } from "../app/customer-config";

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../app",
);
const savedEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...savedEnvironment };
});

describe("production UX hotfixes", () => {
  /*
   * The bug this guards cannot be caught by exercising the function's logic
   * in Vitest, because Vitest runs it as plain Node with `process.env` fully
   * populated — exactly the environment in which the bug is invisible. The
   * failure only exists in a browser bundle: Next.js inlines `NEXT_PUBLIC_*`
   * values into client code by statically pattern-matching a literal
   * `process.env.NEXT_PUBLIC_X` (or `process.env["NEXT_PUBLIC_X"]` with a
   * literal string) expression at the call site. `getConfiguredAdminUrl`
   * used to read `process.env[ADMIN_URL_ENVIRONMENT_VARIABLE]` — an indexed
   * access through a separately declared constant — which the compiler
   * cannot resolve to a specific key, so nothing was ever inlined and every
   * browser read an always-empty `process.env` at runtime: every visitor, in
   * every environment, always saw the admin console link fail to render.
   * Live-verified against the deployed client bundle, which is what actually
   * caught it — this source-pattern check is what stops it coming back.
   */
  it("reads NEXT_PUBLIC_VELYQ_ADMIN_URL as a literal expression Next.js can inline", () => {
    const source = readFileSync(
      path.join(appRoot, "customer-config.ts"),
      "utf8",
    );
    expect(source).toMatch(
      /process\.env(\.NEXT_PUBLIC_VELYQ_ADMIN_URL|\["NEXT_PUBLIC_VELYQ_ADMIN_URL"\])/,
    );
    // The indirection constant that caused the bug must not come back:
    // reintroducing it is how a future edit re-breaks the client inlining
    // without anyone noticing, since every other test here runs in Node and
    // cannot detect it.
    expect(source).not.toContain("ADMIN_URL_ENVIRONMENT_VARIABLE");
  });

  it("rejects Vercel git preview admin URLs in production", () => {
    process.env = {
      ...savedEnvironment,
      NODE_ENV: "production",
      NEXT_PUBLIC_VELYQ_ADMIN_URL:
        "https://velyq-admin-staging-git-main-joker2faces-projects.vercel.app",
    };
    expect(getConfiguredAdminUrl()).toBeNull();

    process.env["NEXT_PUBLIC_VELYQ_ADMIN_URL"] =
      "https://velyq-admin-staging-79jywr7zp-joker2faces-projects.vercel.app";
    expect(getConfiguredAdminUrl()).toBeNull();

    process.env["NEXT_PUBLIC_VELYQ_ADMIN_URL"] =
      "https://velyq-admin-staging.vercel.app/";
    expect(getConfiguredAdminUrl()).toBe(
      "https://velyq-admin-staging.vercel.app",
    );
  });

  it("keeps public pricing static while moving account actions into a session-aware client boundary", () => {
    const chrome = readFileSync(
      path.join(appRoot, "components/site-chrome.tsx"),
      "utf8",
    );
    const actions = readFileSync(
      path.join(appRoot, "components/public-session-actions.tsx"),
      "utf8",
    );
    expect(chrome).toContain("<PublicSessionActions locale={locale} />");
    expect(actions).toContain('state.status === "unauthenticated"');
    expect(actions).toContain('state.status === "ready"');
    expect(actions).toContain('href={localePath("/today", locale)}');
    expect(actions).toContain('href={localePath("/account", locale)}');
  });

  it("uses an authenticated FREE pricing action instead of a second create-account CTA", () => {
    const pricing = readFileSync(
      path.join(appRoot, "pricing/page.tsx"),
      "utf8",
    );
    const actions = readFileSync(
      path.join(appRoot, "components/public-session-actions.tsx"),
      "utf8",
    );
    expect(pricing).toContain("<PricingFreeAction locale={locale} />");
    expect(actions).toContain('state.data.plan === "FREE"');
    expect(actions).toContain('translate("pricingCurrentPlan", locale)');
  });

  it("guards an existing session away from the customer sign-in form", () => {
    const signIn = readFileSync(path.join(appRoot, "sign-in/page.tsx"), "utf8");
    expect(signIn).toContain("resolveCustomerContext(cookieHeader)");
    expect(signIn).toContain('redirect(localePath("/today", locale))');
  });
});
