import { describe, expect, it } from "vitest";
import { assessDataQuality } from "../src/index.js";

/**
 * The freshness component of the quality score must be able to fire.
 *
 * It could not. The forecast cycle passed its own `asOf` as `receivedAt`, so
 * `asOf - receivedAt` was always exactly zero, `stale` was always false,
 * `STALE_DATA` was never emitted, and the `WAIT` branch that reads it was
 * unreachable code. Four of the weighted components always scored full marks,
 * so the grade could not reflect the property most likely to be wrong about a
 * price: its age.
 *
 * These tests pin the component's behaviour directly, so a caller that starts
 * passing its own clock again cannot make it silently inert.
 */

const POLICY_FRESHNESS_SECONDS = 15 * 60;
const ASOF = "2026-09-20T12:00:00.000Z";

function assess(receivedAt: string, overrides: Record<string, unknown> = {}) {
  return assessDataQuality({
    policyVersion: "phase-1-quality.v1",
    asOf: ASOF,
    receivedAt,
    priceCount: 6,
    bookmakerCount: 6,
    lineup: "OFFICIAL",
    mappingConfidence: "HIGH",
    edgeAvailable: true,
    edgePresent: false,
    ...overrides,
  });
}

function minutesBefore(minutes: number): string {
  return new Date(Date.parse(ASOF) - minutes * 60_000).toISOString();
}

describe("quality freshness component", () => {
  it("scores full marks for evidence inside the window", () => {
    const assessment = assess(minutesBefore(1));
    expect(assessment.components.freshness).toBe("1");
    expect(assessment.reasonCodes).not.toContain("STALE_DATA");
  });

  /*
   * The case that was unreachable. An old price now costs the score and
   * raises the reason code, which is what makes the WAIT branch live.
   */
  it("emits STALE_DATA for evidence older than the policy window", () => {
    const assessment = assess(minutesBefore(60));
    expect(assessment.components.freshness).toBe("0");
    expect(assessment.reasonCodes).toContain("STALE_DATA");
  });

  it("puts the boundary where the policy says", () => {
    const inside = assess(minutesBefore(POLICY_FRESHNESS_SECONDS / 60 - 1));
    const outside = assess(minutesBefore(POLICY_FRESHNESS_SECONDS / 60 + 1));
    expect(inside.components.freshness).toBe("1");
    expect(outside.components.freshness).toBe("0");
  });

  /*
   * Age has to actually move the grade, not merely appear in a component.
   * If a stale price scored the same overall grade as a fresh one, the
   * component would be decorative.
   */
  it("makes an old price score worse overall than a fresh one", () => {
    const fresh = assess(minutesBefore(1));
    const stale = assess(minutesBefore(240));
    expect(Number(stale.score)).toBeLessThan(Number(fresh.score));
  });

  /*
   * An unparseable instant is treated as stale rather than as fresh. Failing
   * open here would be the same defect in a different costume.
   */
  it("treats an unusable instant as stale, not as fresh", () => {
    const assessment = assess("not-a-date");
    expect(assessment.components.freshness).toBe("0");
    expect(assessment.reasonCodes).toContain("STALE_DATA");
  });

  /*
   * The specific regression: passing `asOf` itself as the evidence instant
   * always looks perfectly fresh. That is not wrong as arithmetic -- it is
   * wrong as a call site, and this test documents why the value must come
   * from the newest observation instead.
   */
  it("cannot distinguish anything when handed its own clock", () => {
    const assessment = assess(ASOF);
    expect(assessment.components.freshness).toBe("1");
    expect(assessment.reasonCodes).not.toContain("STALE_DATA");
  });
});
