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
