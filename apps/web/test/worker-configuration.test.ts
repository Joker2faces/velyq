import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/*
 * The deployed Worker's configuration is now the source of truth for its
 * environment, because hand-entered dashboard values were silently wiped by a
 * deploy. That makes this file security-relevant: whatever it declares is what
 * production gets.
 *
 * VELYQ_SYNTHETIC_PREVIEW is the one that matters. With it set,
 * requireCustomerPageAccess grants access with no authentication check at all
 * whenever the database is briefly unavailable, and requireCustomerSession
 * hands out FREE entitlements instead of failing closed. It was needed while
 * Cloudflare had no database; it must never come back now that it has one.
 */

const configPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../wrangler.jsonc",
);

function workerConfig() {
  const raw = readFileSync(configPath, "utf8");
  // JSONC: strip comments before parsing. Strings here contain no "//".
  const stripped = raw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1")
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(stripped) as {
    vars?: Record<string, string>;
    hyperdrive?: Array<{ binding: string; id: string }>;
  };
}

describe("deployed Worker configuration", () => {
  it("does not enable synthetic authorization", () => {
    const vars = workerConfig().vars ?? {};
    expect(vars["VELYQ_SYNTHETIC_PREVIEW"]).toBeUndefined();
  });

  it("keeps synthetic football data enabled", () => {
    const vars = workerConfig().vars ?? {};
    expect(vars["VELYQ_CUSTOMER_INTELLIGENCE_MODE"]).toBe("SYNTHETIC_DEMO");
  });

  it("binds Hyperdrive, and does not supply a direct database URL", () => {
    const config = workerConfig();
    expect(config.hyperdrive?.[0]?.binding).toBe("HYPERDRIVE");
    expect(config.hyperdrive?.[0]?.id).toBe("660fd984521442f8be51b97740eb3d4a");
    // A direct URL here would let the Worker bypass Hyperdrive entirely.
    expect(config.vars?.["VELYQ_DATABASE_URL"]).toBeUndefined();
  });

  it("declares the Supabase settings the Worker needs at runtime", () => {
    const vars = workerConfig().vars ?? {};
    expect(vars["NEXT_PUBLIC_SUPABASE_URL"]).toMatch(/^https:\/\/.+\.supabase/);
    expect(vars["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]).toMatch(
      /^sb_publishable_/,
    );
    expect(vars["VELYQ_APPLICATION_ORIGIN"]).toMatch(/^https:\/\//);
  });

  it("carries no secret material", () => {
    const raw = readFileSync(configPath, "utf8");
    // A service-role key or a password would be a disclosure, not a config.
    expect(raw).not.toMatch(/service_role|sb_secret_|SUPABASE_SERVICE/i);
    expect(raw).not.toMatch(/postgres(ql)?:\/\/[^\s"]*:[^\s"@]+@/);
  });
});
