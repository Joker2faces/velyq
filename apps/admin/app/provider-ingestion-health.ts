import type { AdminProviderIngestionRunDto } from "./admin-api";

export type ProviderIngestionHealthInput = Readonly<{
  status: "RUNNING" | "COMPLETED" | "FAILED";
  providerCallsUsed: number;
  discoveryDatesRequested: readonly string[];
  oddsCandidates: number;
  oddsRequestsAttempted: number;
  lineupCandidates: number;
  lineupRequestsAttempted: number;
  resultCandidates: number;
  resultRequestsAttempted: number;
  skippedByReason: Readonly<Record<string, number>>;
  errorsByReason: Readonly<Record<string, number>>;
}>;

type ProviderIngestionFailureInput = Readonly<{
  errorsByReason: Readonly<Record<string, number>>;
  skippedByReason: Readonly<Record<string, number>>;
  purpose?: "DISCOVERY" | "ODDS" | "LINEUP" | "RESULT" | "STATUS";
}>;

/* Persistence ports report per-item write failures as skips so one bad item
   cannot abort its batch. Only failure-shaped skip keys belong on the error
   path; quota, rate-limit, identity, ceiling and deferral skips do not. */
const SKIPPED_FAILURE_REASON =
  /(?:_WRITE_FAILED|_PERSISTENCE_FAILED|_INVALID)$/;

export function hasProviderIngestionFailure(
  input: ProviderIngestionFailureInput,
): boolean {
  const inScope = (reason: string) =>
    input.purpose === undefined || reason.startsWith(`${input.purpose}_`);
  if (
    Object.entries(input.errorsByReason).some(
      ([reason, count]) => count > 0 && inScope(reason),
    )
  )
    return true;
  return Object.entries(input.skippedByReason).some(
    ([reason, count]) =>
      count > 0 && inScope(reason) && SKIPPED_FAILURE_REASON.test(reason),
  );
}

export function deriveProviderIngestionHealth(
  input: ProviderIngestionHealthInput,
): AdminProviderIngestionRunDto["runHealth"] {
  if (input.status === "FAILED") return "FAILED";
  if (input.status === "RUNNING") return "RUNNING";
  if (hasProviderIngestionFailure(input)) return "COMPLETED_WITH_ERRORS";
  if (input.providerCallsUsed > 0) return "HEALTHY_ACTIVE";

  const meaningfulSkips = Object.entries(input.skippedByReason).filter(
    ([, count]) => count > 0,
  );
  if (
    meaningfulSkips.some(
      ([reason]) =>
        reason.includes("QUOTA_") || reason.includes("UNKNOWN_QUOTA"),
    )
  )
    return "QUOTA_BLOCKED";
  if (
    meaningfulSkips.some(
      ([reason]) =>
        reason.includes("PURPOSE_BUDGET_SPENT") ||
        reason.endsWith("RUN_CEILING") ||
        reason.endsWith("BATCH_CEILING"),
    )
  )
    return "BUDGET_BLOCKED";

  const hasDueOrAttemptedWork =
    input.discoveryDatesRequested.length > 0 ||
    input.oddsCandidates + input.lineupCandidates + input.resultCandidates >
      0 ||
    input.oddsRequestsAttempted +
      input.lineupRequestsAttempted +
      input.resultRequestsAttempted >
      0;
  return hasDueOrAttemptedWork || meaningfulSkips.length > 0
    ? "WORK_BLOCKED"
    : "HEALTHY_IDLE";
}
