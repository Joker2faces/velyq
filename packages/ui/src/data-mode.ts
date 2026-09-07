/**
 * Which kind of data a customer is looking at, and therefore what VELYQ owes
 * them by way of disclosure.
 *
 * This is presentation only. It deliberately introduces no flag, no
 * environment variable and no second source of truth, because there is
 * already one that cannot drift: every synthetic record carries a provenance
 * label, and the data contract enforces it — `syntheticLabel` is typed as a
 * literal and validated by the provider schemas, the contract validators and
 * the application layer. Synthetic data cannot reach a customer surface
 * without saying so.
 *
 * So the disclosure follows the data rather than a setting beside it. A build
 * misconfigured to serve fixtures while claiming to be live would still
 * disclose, because the rows themselves are what answer the question. A flag
 * would have to be kept in step by hand, and the one failure that matters
 * here — demo data presented silently as real football — is exactly the
 * failure a hand-kept flag permits.
 *
 * The reverse case is just as important: once real observations are flowing,
 * nothing carries the synthetic provenance, `LIVE` is the answer, and no
 * disclosure appears anywhere. Real data must not be hedged as a preview.
 */

/** The provenance marker the data contract requires of synthetic records. */
const SYNTHETIC_PROVENANCE = "Synthetic data";

export type DataMode = "DEMO" | "LIVE";

/**
 * Resolves the mode from a surface's provenance label.
 *
 * `DEMO` only when the label is present and marks synthetic provenance.
 * Anything else is `LIVE` — including an absent label, since a record with no
 * synthetic provenance is, by the contract's own rule, not synthetic.
 */
export function dataMode(provenanceLabel: string | null | undefined): DataMode {
  return provenanceLabel?.trim() === SYNTHETIC_PROVENANCE ? "DEMO" : "LIVE";
}

/** True when the customer must be told that what they are reading is a preview. */
export function requiresPreviewDisclosure(
  provenanceLabel: string | null | undefined,
): boolean {
  return dataMode(provenanceLabel) === "DEMO";
}
