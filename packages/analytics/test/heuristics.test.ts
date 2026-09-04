import { describe, expect, it } from "vitest";
import { calculateEdge, calculateRadar } from "../src/index.js";
describe("development heuristics", () => {
  it("labels EDGE explicitly and exposes observable components", () => {
    const result = calculateEdge({
      probabilityEdge: "0.1",
      expectedValue: "0.2",
      qualityScore: "1",
      scoreVersion: "edge.v1",
    });
    expect(result.ok && result.value.validationStatus).toBe(
      "DEVELOPMENT_HEURISTIC",
    );
    expect(JSON.stringify(result)).not.toMatch(/volume|money|stake/i);
  });
  it("reports RADAR movement and stale evidence without money claims", () => {
    const result = calculateRadar({
      openingOdds: "2",
      currentOdds: "1.8",
      bookmakerCoverage: 2,
      observedAt: "2026-09-04T08:00:00.000Z",
      asOf: "2026-09-04T09:00:00.000Z",
      scoreVersion: "radar.v1",
    });
    expect(result.ok && result.value.movement).toBe("-0.2");
    expect(result.ok && result.value.freshness).toBe("STALE");
  });

  it("applies persisted EDGE weights and caps without floating point arithmetic", () => {
    const result = calculateEdge({
      probabilityEdge: "0.3",
      expectedValue: "0.2",
      qualityScore: "1",
      scoreVersion: "edge.v1",
      formula: {
        weights: {
          probabilityEdge: "2",
          expectedValue: "1",
          quality: "1",
        },
        capsPenalties: { probabilityEdgeCap: "0.1" },
      },
    });

    expect(result.ok && result.value.components.probabilityEdge).toBe("0.3");
    expect(result.ok && result.value.score).toBe("0.35");
  });

  it("exposes RADAR velocity, consensus, divergence, and weighted score", () => {
    const result = calculateRadar({
      openingOdds: "2",
      currentOdds: "1.8",
      bookmakerCoverage: 2,
      bookmakersMoving: 1,
      movementWindowSeconds: 60,
      observedAt: "2026-09-04T08:55:00.000Z",
      asOf: "2026-09-04T09:00:00.000Z",
      scoreVersion: "radar.v1",
      formula: { weights: { movement: "2", velocity: "1" } },
    });

    expect(result.ok && result.value.components.velocity).toBe(
      "0.003333333333333333333333333333",
    );
    expect(result.ok && result.value.components.consensus).toBe("1");
    expect(result.ok && result.value.components.divergence).toBe("1");
    expect(result.ok && result.value.score).toBe(
      "0.733888888888888888888888888889",
    );
  });
});
