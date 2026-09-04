import { describe, expect, it } from "vitest";
import { stagingStatusShellCopy } from "../../apps/web/app/staging-status-shell-content";

describe("staging status shell", () => {
  it("renders safe staging identity and synthetic data status", () => {
    const markup = stagingStatusShellCopy.join(" ");

    expect(markup).toContain("VELYQ");
    expect(markup).toContain("STAGING");
    expect(markup).toContain("PHASE 1 DEVELOPMENT");
    expect(markup).toContain("Synthetic Phase 1 data only");
    expect(markup).not.toMatch(
      /SUPABASE|SERVICE_ROLE|DATABASE_URL|SECRET|TOKEN/i,
    );
  });
});
