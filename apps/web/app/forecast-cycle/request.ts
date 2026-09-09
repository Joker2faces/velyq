import { utcDayWindow } from "@velyq/database";

const DEFAULT_WINDOW_HOURS = 24;
const MAX_WINDOW_HOURS = 48;
const SUPPORTED_MODES = ["LIVE", "SYNTHETIC_DEMO"] as const;

export type ForecastCycleMode = (typeof SUPPORTED_MODES)[number];

export type ForecastCycleRequest = Readonly<{
  from: Date;
  to: Date;
  mode: ForecastCycleMode;
}>;

export type ForecastCycleRequestValidation =
  | Readonly<{ ok: true; value: ForecastCycleRequest }>
  | Readonly<{
      ok: false;
      reason:
        | "INVALID_FROM"
        | "INVALID_TO"
        | "FROM_NOT_BEFORE_TO"
        | "WINDOW_TOO_LARGE"
        | "UNSUPPORTED_MODE";
    }>;

/**
 * Validates the trigger's request body against real bounds, never against
 * "whatever the caller happened to send" -- an unbounded or malformed
 * window is exactly what turns an internal trigger into an accidental
 * full-corpus scan or a hung request. `from`/`to` default to a
 * conservative rolling 24h window (matching the product's actual forecast
 * cadence, not an arbitrary probe of history) when the caller omits them,
 * which is also what a scheduled cron invocation with an empty body gets.
 */
export function validateForecastCycleRequest(
  body: unknown,
  now: Date,
): ForecastCycleRequestValidation {
  const input = isPlainObject(body) ? body : {};

  /*
   * The default window starts at the beginning of the current UTC day, not at
   * `now`.
   *
   * The customer's Today surface is a strict UTC calendar day
   * (`utcDayWindow`), while a cron firing at 04:00 with a `now`-anchored
   * window covered 04:00 today to 04:00 tomorrow -- so fixtures kicking off
   * between midnight and the cron's own firing time were the one slice of
   * Today that could never receive a forecast, purely as an artefact of when
   * the schedule happened to run. Anchoring to the day the customer is shown
   * removes that hole and makes the default independent of firing time.
   */
  const from =
    typeof input["from"] === "string"
      ? new Date(input["from"])
      : utcDayWindow(now).start;
  if (Number.isNaN(from.getTime()))
    return { ok: false, reason: "INVALID_FROM" };

  const to =
    typeof input["to"] === "string"
      ? new Date(input["to"])
      : new Date(from.getTime() + DEFAULT_WINDOW_HOURS * 3_600_000);
  if (Number.isNaN(to.getTime())) return { ok: false, reason: "INVALID_TO" };

  if (from.getTime() >= to.getTime())
    return { ok: false, reason: "FROM_NOT_BEFORE_TO" };

  const windowHours = (to.getTime() - from.getTime()) / 3_600_000;
  if (windowHours > MAX_WINDOW_HOURS)
    return { ok: false, reason: "WINDOW_TOO_LARGE" };

  const mode = typeof input["mode"] === "string" ? input["mode"] : "LIVE";
  if (!isSupportedMode(mode)) return { ok: false, reason: "UNSUPPORTED_MODE" };

  return { ok: true, value: { from, to, mode } };
}

function isSupportedMode(value: string): value is ForecastCycleMode {
  return (SUPPORTED_MODES as readonly string[]).includes(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
