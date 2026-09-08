import { describe, expect, it } from "vitest";

import { loadProductionModelArtifact } from "../app/forecast-cycle/model-artifact";

/*
 * Proves the production artifact loader against the real, committed
 * artifact -- not a fabricated fixture -- using the exact static-import
 * path Next.js bundles into the deployed function. A corrupted or
 * hand-edited artifact.json would fail this the same way it fails
 * `loadModelArtifact`'s own fingerprint check in @velyq/research.
 */
describe("loadProductionModelArtifact", () => {
  it("loads and fingerprint-validates the real committed artifact", () => {
    const artifact = loadProductionModelArtifact();
    expect(artifact.modelCode).toBe("FOOTBALL_DIXON_COLES");
    expect(artifact.version).toBe("football-dixon-coles.v1");
    expect(artifact.maturity).toBe("EXPERIMENTAL");
    expect(typeof artifact.trainingCutoff).toBe("string");
    expect(artifact.parameters.teams.length).toBeGreaterThan(0);
  });

  it("caches the artifact across calls rather than re-validating every time", () => {
    const first = loadProductionModelArtifact();
    const second = loadProductionModelArtifact();
    expect(second).toBe(first);
  });
});
