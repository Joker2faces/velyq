/**
 * Server-only trigger secret for the internal forecast-cycle endpoint.
 * Uses `CRON_SECRET` deliberately, not a VELYQ-namespaced name: Vercel's
 * own Cron Jobs feature auto-injects `Authorization: Bearer $CRON_SECRET`
 * on every cron-triggered request whenever a project env var literally
 * named `CRON_SECRET` is configured (https://vercel.com/docs/cron-jobs
 * as of this writing) -- so setting this one name is what makes the
 * scheduled path (item 12) work with zero extra request-signing code, the
 * same way `STRIPE_WEBHOOK_SECRET` in billing/webhook/route.ts is matched
 * to Stripe's own convention rather than an invented one. No existing
 * `CRON_SECRET`/`VELYQ_TRIGGER_SECRET`/`VELYQ_INGEST_SECRET` was found
 * anywhere in this repository before this file (checked apps/web/app/
 * api/**, .env.example, and the config package).
 */
const HEADER_NAME = "authorization";
const HEADER_PREFIX = "Bearer ";

export type ForecastCycleAuthResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: "SECRET_NOT_CONFIGURED" | "UNAUTHORIZED" }>;

export function checkForecastCycleAuth(
  headers: Pick<Headers, "get">,
): ForecastCycleAuthResult {
  const configuredSecret = process.env["CRON_SECRET"];
  if (!configuredSecret) return { ok: false, reason: "SECRET_NOT_CONFIGURED" };

  const header = headers.get(HEADER_NAME);
  if (!header || !header.startsWith(HEADER_PREFIX))
    return { ok: false, reason: "UNAUTHORIZED" };

  const provided = header.slice(HEADER_PREFIX.length);
  if (!timingSafeEqual(provided, configuredSecret))
    return { ok: false, reason: "UNAUTHORIZED" };

  return { ok: true };
}

/**
 * A plain `===` comparison leaks timing information proportional to how
 * many leading characters match, which is a real (if narrow) side channel
 * for guessing a secret one byte at a time. Constant-time comparison over
 * equal-length buffers closes that without depending on Node's
 * `crypto.timingSafeEqual` refusing unequal-length inputs (handled here by
 * bailing out on a length mismatch before it would throw).
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}
