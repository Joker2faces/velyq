/**
 * The single clock the synthetic demo fixtures read "now" from.
 *
 * The fixture data used to hardcode absolute timestamps (`2026-09-04T…`), so
 * the demo's "today" silently became the past the moment that date passed —
 * kickoffs, the snapshot time and the feature cutoff all read as stale to a
 * visitor on any later day. Every fixture builder takes a `Date` instead, so
 * "today" is always the day the product is actually being viewed on.
 *
 * `VELYQ_DEMO_CLOCK` is a test/e2e-only escape hatch: it lets a deterministic
 * clock be injected so assertions and visual baselines don't have to change
 * every day. Production never sets it, so `resolveDemoClock()` always
 * returns the real current time there.
 */
export function resolveDemoClock(): Date {
  const override = process.env["VELYQ_DEMO_CLOCK"];
  if (override) {
    const parsed = new Date(override);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

/** `base` shifted by `hours` (fractional allowed), as an ISO string. */
export function offsetHours(base: Date, hours: number): string {
  return new Date(base.getTime() + hours * 60 * 60 * 1000).toISOString();
}
