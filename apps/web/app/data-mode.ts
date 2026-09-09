/**
 * The single authoritative answer to "is this runtime allowed to serve
 * synthetic football data?".
 *
 * This exists because the answer used to be inferred, differently, in four
 * places -- and every one of those inferences was wrong on Cloudflare. The
 * authenticated RC served the synthetic fixture (Premier Synthetic League,
 * Northbridge United, a fabricated settled-decision history) while its own
 * health endpoint reported `LIVE`, because:
 *
 *   - `customerFixtureMode()` returned true whenever `VERCEL_ENV` was absent
 *     and `NODE_ENV` was not exactly "production". On a Worker, `VERCEL_ENV`
 *     is *always* absent. Platform identity is not a data mode.
 *   - `customerService()` fell back to the fixture service whenever the
 *     database failed to open, so a connectivity fault silently became
 *     fabricated football rather than an honest outage.
 *   - the health endpoint translated a config string into a label without
 *     ever asking which service the customer surfaces actually used.
 *
 * The rules here are deliberately blunt and have exactly one input:
 *
 *   1. Synthetic data requires an EXPLICIT opt-in --
 *      `VELYQ_CUSTOMER_INTELLIGENCE_MODE=SYNTHETIC_DEMO`, spelled exactly.
 *   2. Anything else -- unset, empty, misspelled, "live", "demo",
 *      "SYNTHETIC", a stray whitespace variant -- is LIVE. Absence of
 *      configuration must never be a licence to fabricate data, so the
 *      default fails closed toward real data or no data.
 *   3. `VERCEL_ENV`, `NODE_ENV`, the presence of a Vercel/Cloudflare
 *      platform marker, and database availability are NOT inputs. None of
 *      them says anything about whether fabricated football is acceptable.
 */
export type CustomerDataMode = "LIVE" | "SYNTHETIC_DEMO";

/** What the deployment was configured to be, from its one canonical var. */
export function configuredDataMode(): CustomerDataMode {
  return process.env["VELYQ_CUSTOMER_INTELLIGENCE_MODE"] === "SYNTHETIC_DEMO"
    ? "SYNTHETIC_DEMO"
    : "LIVE";
}

/**
 * Whether the synthetic fixture system may be reached at all. In LIVE this
 * is always false -- there is no database-failure, preview-flag or
 * missing-platform-variable path back to it.
 */
export function syntheticDataAllowed(): boolean {
  return configuredDataMode() === "SYNTHETIC_DEMO";
}

/** Where customer reads actually come from, given the mode and reality. */
export type CustomerDataSource = "DATABASE" | "FIXTURE" | "UNAVAILABLE";

/**
 * The one decision function. `customerService()` and the health/readiness
 * endpoints both call this, which is what makes health incapable of
 * claiming a source the customer surfaces are not really using.
 *
 * LIVE with no database is `UNAVAILABLE` -- an honest 503 -- and never
 * `FIXTURE`.
 */
export function resolveCustomerDataSource(
  mode: CustomerDataMode,
  databaseAvailable: boolean,
): CustomerDataSource {
  if (mode === "SYNTHETIC_DEMO") return "FIXTURE";
  return databaseAvailable ? "DATABASE" : "UNAVAILABLE";
}
