import { describe, expect, it } from "vitest";
import {
  type CustomerMatchDto,
  type ProblemDetails,
  validateCustomerMatchDto,
  validateCustomerTodayDto,
  validateProblemDetails,
} from "../src/index.js";

const validMatch = {
  eventId: "event-1",
  homeTeam: "Home",
  awayTeam: "Away",
  competition: "competition",
  startsAt: "2026-09-04T10:00:00.000Z",
  syntheticLabel: "Synthetic data",
  scenario: {
    id: "74000000-0000-4000-8000-000000000005",
    state: "NO_BET",
    label: "No bet",
  },
  freshness: "CURRENT",
  selection: "HOME",
  recommendation: "NO_BET",
  modelProbability: "0.6",
  impliedProbability: "0.5",
  fairOdds: "1.666666666666666666666666666667",
  currentOdds: "2",
  openingOdds: "2.1",
  movementPercent: "-0.047619047619",
  movementState: "MOVED",
  observationTimes: 2,
  priceValidity: {
    status: "ATTRACTIVE",
    policyVersion: "price-validity.v1",
    breakEvenOdds: "1.6666666667",
    minimumAcceptableOdds: "1.7",
  },
  probabilityEdge: "0.1",
  expectedValue: "0.2",
  lineup: "OFFICIAL",
  quality: {
    grade: "A",
    score: "1",
    policyVersion: "phase-1-quality.v1",
    reasonCodes: [],
  },
  trace: {
    modelVersion: "model.v1",
    maturity: "EXPERIMENTAL",
    calibrationVersion: "calibration.v1",
    scoreVersion: "score.v1",
    featureCutoff: "2026-09-04T09:59:00.000Z",
  },
} as const;

describe("customer API contracts", () => {
  it("keeps customer match metrics nullable for refusal states", () => {
    const match: Pick<
      CustomerMatchDto,
      "recommendation" | "modelProbability" | "expectedValue"
    > = {
      recommendation: "INSUFFICIENT_DATA",
      modelProbability: null,
      expectedValue: null,
    };
    expect(match.modelProbability).toBeNull();
    expect(match.expectedValue).toBeNull();
  });
  it("defines stable problem details without provider payload fields", () => {
    const problem: ProblemDetails = {
      type: "https://velyq.dev/problems/unauthorized",
      title: "Authentication required",
      status: 401,
      code: "UNAUTHORIZED",
      requestId: "request-1",
    };
    expect(problem.status).toBe(401);
    expect(JSON.stringify(problem)).not.toMatch(
      /raw|providerPayload|service.?role/i,
    );
    expect(validateProblemDetails(problem).ok).toBe(true);
    expect(validateProblemDetails({ ...problem, status: "401" }).ok).toBe(
      false,
    );
  });

  it("validates API decimal strings without coercing their exact text", () => {
    const result = validateCustomerMatchDto(validMatch);

    expect(result).toEqual({ ok: true, value: validMatch });
    if (result.ok) expect(result.value.modelProbability).toBe("0.6");
  });

  it("accepts an explicit unavailable-market label instead of relabelling live fixtures as demo data", () => {
    expect(
      validateCustomerMatchDto({
        ...validMatch,
        syntheticLabel: "Market data unavailable",
      }),
    ).toMatchObject({ ok: true });
  });

  it.each([
    ["id", ""],
    ["state", "UNKNOWN"],
    ["label", ""],
  ] as const)("rejects an invalid scenario %s", (field, value) => {
    const result = validateCustomerMatchDto({
      ...validMatch,
      scenario: { ...validMatch.scenario, [field]: value },
    });

    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors).toContain(`scenario.${field} is invalid`);
  });

  it.each([
    ["modelProbability", 0.6],
    ["impliedProbability", "0.50"],
    ["fairOdds", "1.00"],
    ["fairOdds", "1"],
    ["fairOdds", "0"],
    ["expectedValue", "Infinity"],
  ] as const)("rejects malformed API decimal %s", (field, value) => {
    const result = validateCustomerMatchDto({ ...validMatch, [field]: value });

    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors).toContain(
        `${field} must be a valid canonical decimal string`,
      );
  });

  it("validates every match in the today DTO", () => {
    const result = validateCustomerTodayDto({
      syntheticLabel: "Synthetic data",
      asOf: "2026-09-04T10:00:00.000Z",
      matches: [validMatch, { ...validMatch, currentOdds: "not-a-decimal" }],
    });

    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors).toContain(
        "matches[1].currentOdds must be a valid canonical decimal string",
      );
  });
});

/*
 * The movement invariant, enforced at the boundary.
 *
 * RADAR once rendered "Price unchanged" for a market whose own opening and
 * current prices disagreed, because a null movement figure has two
 * incompatible meanings and the surface could not tell them apart.
 * `movementState` was added to separate "we cannot know" from "it held". This
 * pins the pairing so a future producer cannot emit a movement figure while
 * simultaneously claiming there is not enough history to compute one.
 */
describe("customer match movement invariant", () => {
  it("rejects a movement figure alongside INSUFFICIENT_HISTORY", () => {
    const result = validateCustomerMatchDto({
      ...validMatch,
      movementState: "INSUFFICIENT_HISTORY",
      movementPercent: "0.05",
      openingOdds: "1.90",
      observationTimes: 1,
    });

    expect(result.ok).toBe(false);
  });

  it("accepts INSUFFICIENT_HISTORY when nothing is claimed about movement", () => {
    const result = validateCustomerMatchDto({
      ...validMatch,
      movementState: "INSUFFICIENT_HISTORY",
      movementPercent: null,
      openingOdds: null,
      observationTimes: 1,
    });

    expect(result.ok).toBe(true);
  });

  it("requires a non-negative integer observation count", () => {
    for (const observationTimes of [-1, 1.5, "2", null, undefined]) {
      expect(
        validateCustomerMatchDto({ ...validMatch, observationTimes }).ok,
        String(observationTimes),
      ).toBe(false);
    }
  });
});
/*
 * The DTO used to accept only FRESH and STALE, which made an AGING price
 * indistinguishable from one observed a day earlier, and UNAVAILABLE
 * indistinguishable from merely old.
 */
describe("customer match freshness vocabulary", () => {
  it("accepts every state the freshness policy can produce", () => {
    for (const freshness of ["CURRENT", "AGING", "STALE", "UNAVAILABLE"]) {
      const result = validateCustomerMatchDto({ ...validMatch, freshness });
      expect(result.ok, `${freshness} should validate`).toBe(true);
    }
  });

  it("rejects the collapsed vocabulary it replaced", () => {
    for (const freshness of ["FRESH", "fresh", "", "OLD"]) {
      const result = validateCustomerMatchDto({ ...validMatch, freshness });
      expect(result.ok).toBe(false);
    }
  });
});
