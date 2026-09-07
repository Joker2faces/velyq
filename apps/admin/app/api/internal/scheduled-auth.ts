import { timingSafeEqual } from "node:crypto";

/**
 * The shared gate on every scheduled internal route.
 *
 * One implementation rather than one per route: these endpoints trigger real
 * provider spend and write real predictions, and an authorization check that
 * exists in three slightly different copies is a check that will eventually
 * be wrong in one of them.
 *
 * Two secrets are accepted, for two callers that genuinely differ:
 *
 * - `CRON_SECRET` is the name Vercel looks for. When it is set, the platform
 *   sends it as the bearer token on every scheduled invocation, which is what
 *   makes a cron request distinguishable from any other request to the same
 *   path.
 * - `VELYQ_TRIGGER_SECRET` is for an operator running a cycle on purpose — a
 *   shadow run, a re-poll after a provider outage. Kept separate so that
 *   rotating the operator's credential does not silently stop the schedule,
 *   and so the two can be revoked independently.
 *
 * Both are compared in constant time, and a deployment with neither
 * configured refuses everything. An unconfigured deployment refusing every
 * run is a visibly broken scheduler; an unconfigured deployment accepting
 * every request is an open endpoint that spends the provider budget on
 * whoever finds it.
 */
export function authorizedScheduledRequest(request: Request): boolean {
  const supplied = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/)?.[1];
  if (!supplied) return false;
  const suppliedBytes = Buffer.from(supplied);
  /*
   * Every candidate is compared, with no early exit on the first match. The
   * loop's timing then depends on how many secrets are configured rather than
   * on which one the caller happened to guess.
   */
  let matched = false;
  for (const name of ["CRON_SECRET", "VELYQ_TRIGGER_SECRET"] as const) {
    const expected = process.env[name];
    if (!expected) continue;
    const expectedBytes = Buffer.from(expected);
    if (
      expectedBytes.length === suppliedBytes.length &&
      timingSafeEqual(expectedBytes, suppliedBytes)
    )
      matched = true;
  }
  return matched;
}
