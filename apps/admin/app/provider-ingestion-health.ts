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

export function deriveProviderIngestionHealth(
  input: ProviderIngestionHealthInput,
): AdminProviderIngestionRunDto["runHealth"] {
  if (input.status === "FAILED") return "FAILED";
  if (input.status === "RUNNING") return "RUNNING";
  if (Object.values(input.errorsByReason).some((count) => count > 0))
    return "COMPLETED_WITH_ERRORS";
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
