import { describe, expect, it } from "vitest";

import {
  artifactFingerprint,
  loadModelArtifact,
  type ModelArtifact,
} from "../src/artifact.js";

/*
 * Production inference's only entry point onto disk-shaped data. A model
 * fitted once and loaded many times has to be validated at the boundary,
 * not trusted because it happened to parse as JSON.
 */
function validArtifact(): ModelArtifact {
  return {
    modelCode: "FOOTBALL_DIXON_COLES",
    version: "football-dixon-coles.v1",
    maturity: "EXPERIMENTAL",
    featureContractVersion: "football-goals-features.v1",
    trainingCutoff: "2024-12-15",
    trainingDatasetFingerprint: "sha256:deadbeef",
    parameters: {
      teams: [
        {
          teamKey: "nijmegen",
          competitionCode: "NLD_EREDIVISIE",
          attack: 0.1,
          defence: -0.1,
          sampleWeight: 30,
          matches: 60,
        },
      ],
      competitions: [
        { competitionCode: "NLD_EREDIVISIE", homeAdvantage: 0.25 } as never,
      ],
      rho: -0.05,
      hyperparameters: {} as never,
      trainingCutoff: "2024-12-15",
      iterations: 50,
      logLikelihood: -1000,
      converged: true,
      matchesUsed: 3333,
    },
    calibrators: [],
    uncertaintyProfiles: [],
    validationReport: {
      generatedAt: "2026-09-08T00:00:00Z",
      corpusSourceCodes: ["FOOTBALL_DATA_UK"],
      walkForwardCutoffs: ["2024-12-15"],
      holdoutFrom: "2024-12-15",
      trainRecords: 100,
      validationRecords: 200,
      holdoutRecords: 300,
      leakageAudit: { ok: true, violations: 0 },
      competitions: [],
    },
  };
}

describe("loadModelArtifact", () => {
  it("accepts a real artifact whose fingerprint matches", () => {
    const artifact = validArtifact();
    const fingerprint = artifactFingerprint(artifact);

    const result = loadModelArtifact(
      JSON.parse(JSON.stringify(artifact)),
      fingerprint,
    );

    expect(result).toMatchObject({ ok: true });
  });

  it("rejects a corrupted/tampered artifact whose content no longer matches its recorded fingerprint", () => {
    const artifact = validArtifact();
    const fingerprint = artifactFingerprint(artifact);
    const tampered = {
      ...JSON.parse(JSON.stringify(artifact)),
      parameters: {
        ...artifact.parameters,
        rho: 0.5, // silently different from what was actually fit
      },
    };

    const result = loadModelArtifact(tampered, fingerprint);

    expect(result).toEqual({ ok: false, reason: "FINGERPRINT_MISMATCH" });
  });

  it("rejects a value that is not a plain object", () => {
    expect(loadModelArtifact(null, "sha256:x")).toEqual({
      ok: false,
      reason: "INVALID_JSON_SHAPE",
    });
    expect(loadModelArtifact("not-json", "sha256:x")).toEqual({
      ok: false,
      reason: "INVALID_JSON_SHAPE",
    });
    expect(loadModelArtifact([], "sha256:x")).toEqual({
      ok: false,
      reason: "INVALID_JSON_SHAPE",
    });
  });

  it("rejects an object missing required fields", () => {
    const result = loadModelArtifact(
      { modelCode: "FOOTBALL_DIXON_COLES" },
      "sha256:x",
    );
    expect(result).toEqual({ ok: false, reason: "INVALID_JSON_SHAPE" });
  });

  it("rejects an artifact for an unrecognized model code, never guessing at its shape", () => {
    const artifact = { ...validArtifact(), modelCode: "SOMETHING_ELSE" };
    const result = loadModelArtifact(artifact, "sha256:whatever");
    expect(result).toEqual({ ok: false, reason: "UNKNOWN_MODEL_CODE" });
  });

  it("is deterministic: loading the same bytes twice produces the same forecast-ready artifact", () => {
    const artifact = validArtifact();
    const fingerprint = artifactFingerprint(artifact);
    const serialized = JSON.stringify(artifact);

    const first = loadModelArtifact(JSON.parse(serialized), fingerprint);
    const second = loadModelArtifact(JSON.parse(serialized), fingerprint);

    expect(first).toEqual(second);
  });
});
