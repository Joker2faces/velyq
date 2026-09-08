import { loadModelArtifact, type ModelArtifact } from "@velyq/research";
import rawArtifact from "@velyq/research/artifacts/football-dixon-coles.v1.json";
import artifactMeta from "@velyq/research/artifacts/football-dixon-coles.v1.meta.json";

/**
 * Loads the committed, fingerprinted Dixon-Coles artifact from the build
 * output itself -- a static import, not a runtime file read -- so it needs
 * no local filesystem path, no WSL path, and none of the raw
 * football-data.co.uk corpus files (gitignored, dev-machine only) at
 * runtime. Next's bundler traces this import at build time the same way it
 * traces any other module, so the artifact ships inside the deployed
 * function the same way application code does.
 *
 * Validated once per cold start (fingerprint-checked against the sidecar
 * `.meta.json`, not recomputed from a value the file itself could have
 * supplied), then cached for the lifetime of the runtime -- a model that
 * refits or reloads unvalidated on every request is exactly the audit gap
 * `loadModelArtifact` exists to close.
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
