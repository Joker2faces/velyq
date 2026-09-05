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
  freshness: "FRESH",
  selection: "HOME",
  recommendation: "NO_BET",
  modelProbability: "0.6",
  impliedProbability: "0.5",
  fairOdds: "1.666666666666666666666666666667",
  currentOdds: "2",
  openingOdds: "2.1",
  movementPercent: "-0.047619047619",
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
