import { timingSafeEqual } from "node:crypto";

/**
 * The shared gate on every scheduled internal route.
 *
 * One implementation rather than one per route: these endpoints trigger real
 * provider spend and write real predictions, and an authorization check that
 * exists in three slightly different copies is a check that will eventually
 * be wrong in one of them.
 *
 * Compared in constant time, and a missing secret fails closed. An
 * unconfigured deployment refusing every scheduled run is a visibly broken
 * scheduler; an unconfigured deployment accepting every request is an open
 * endpoint that spends the provider budget on whoever finds it.
 */
export function authorizedScheduledRequest(request: Request): boolean {
  const expected = process.env["CRON_SECRET"];
  const supplied = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/)?.[1];
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return (
    expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes)
  );
}
