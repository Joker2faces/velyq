/**
 * Authorization for the scheduler-driven ingestion endpoint.
 *
 * A dedicated secret rather than a reused one. `APISPORTS_KEY` is a provider
 * credential, `CRON_SECRET` is the name Vercel's own Cron feature injects,
 * and `VELYQ_TRIGGER_SECRET` already gates a different trigger -- handing any
 * of them to Supabase Cron would widen what a leak of that one value reaches.
 * `VELYQ_SCHEDULER_SECRET` exists so the scheduler holds exactly one
 * capability: ask the ingestion endpoint to run.
 *
 * The value lives server-side in the Vercel runtime and, on the calling side,
 * in Supabase Vault. It is never sent to a browser, never in a
 * `NEXT_PUBLIC_*` name, and never logged.
 */
const HEADER_NAME = "authorization";
const HEADER_PREFIX = "Bearer ";

export type SchedulerAuthResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: "SECRET_NOT_CONFIGURED" | "UNAUTHORIZED" }>;

export function checkSchedulerAuth(
  headers: Pick<Headers, "get">,
): SchedulerAuthResult {
  const configured = process.env["VELYQ_SCHEDULER_SECRET"];
  /*
   * A missing server-side secret is an operator misconfiguration, not a
   * caller's fault, and the two must not be answered identically: an
   * unconfigured endpoint that returned 401 would look exactly like a
   * scheduler using the wrong key, and the real problem would stay hidden.
   */
  if (!configured) return { ok: false, reason: "SECRET_NOT_CONFIGURED" };

  const header = headers.get(HEADER_NAME);
  if (!header || !header.startsWith(HEADER_PREFIX))
    return { ok: false, reason: "UNAUTHORIZED" };

  const provided = header.slice(HEADER_PREFIX.length);
  if (!timingSafeEqual(provided, configured))
    return { ok: false, reason: "UNAUTHORIZED" };

  return { ok: true };
}

/**
 * Constant-time comparison over equal-length inputs.
 *
 * A plain `===` leaks timing proportional to how many leading characters
 * match, which is a real if narrow way to guess a secret one byte at a time.
 * The length check happens first so this never depends on Node's
 * `crypto.timingSafeEqual` refusing unequal-length buffers -- and so it works
 * unchanged on any runtime this endpoint might be deployed to.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}
