import { describe, expect, it } from "vitest";
import webConfig from "../../apps/web/next.config.mjs";
import adminConfig from "../../apps/admin/next.config.mjs";

describe.each([
  ["customer", webConfig],
  ["admin", adminConfig],
])("%s security headers", (_name, config) => {
  it("applies browser hardening headers to every route", async () => {
    const entries = await config.headers?.();
    expect(entries).toHaveLength(1);
    expect(entries?.[0]?.source).toBe("/:path*");
    const headers = Object.fromEntries(
      entries?.[0]?.headers.map(({ key, value }) => [
        key.toLowerCase(),
        value,
      ]) ?? [],
    );

    expect(headers["content-security-policy"]).toContain("default-src 'self'");
    expect(headers["strict-transport-security"]).toContain("max-age=31536000");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
  });
});
