import { describe, expect, it } from "vitest";
import type { CustomerMatchDto, ProblemDetails } from "../src/index.js";

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
  });
});
