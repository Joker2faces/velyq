import { loadModelArtifact, type ModelArtifact } from "@velyq/research";
import rawArtifact from "@velyq/research/artifacts/football-dixon-coles.v1.json";
import artifactMeta from "@velyq/research/artifacts/football-dixon-coles.v1.meta.json";

/**
 * Loads the committed, fingerprinted Dixon-Coles artifact from the build
 * output itself. Identical to `apps/web/app/forecast-cycle/model-artifact.ts`
 * -- deliberately duplicated rather than shared across apps, since neither
 * app may import the other's code and the artifact JSON's own package
 * (`@velyq/research`) cannot re-export this loader without pulling its
 * `rootDir`/JSON-import setup into a place the package's own build does not
 * expect. This app needs it to recompute a forecast right after the lineup
 * that made it stale finishes writing, in the same request, without a
 * cross-service call to `apps/web`.
 *
 * Validated once per cold start (fingerprint-checked against the sidecar
 * `.meta.json`), then cached for the lifetime of the runtime.
 */
let cached: ModelArtifact | null = null;

export function loadProductionModelArtifact(): ModelArtifact {
  if (cached) return cached;

  const result = loadModelArtifact(rawArtifact, artifactMeta.artifactReference);
  if (!result.ok) {
    throw new Error(`MODEL_ARTIFACT_INVALID: ${result.reason}`);
  }
  cached = result.value;
  return cached;
}
