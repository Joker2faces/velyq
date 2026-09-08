import { settleDecision, type SettlementOutcome } from "@velyq/analytics";

export type ProviderFinalResult = Readonly<{
  provider: string;
  providerFixtureId: string;
  status: "FINAL" | "IN_PROGRESS" | "CANCELLED" | "ABANDONED";
  homeScore: number | null;
  awayScore: number | null;
  observedAt: string;
}>;
export type SettlementCandidate = Readonly<{
  decisionId: string;
  market: "1X2" | "OVER_UNDER_2_5";
  selection: "HOME" | "DRAW" | "AWAY" | "OVER" | "UNDER";
}>;
export type SettlementInstruction = Readonly<{
  decisionId: string;
  providerFixtureId: string;
  outcome: SettlementOutcome;
  observedAt: string;
}>;

/** Provider-neutral boundary: fixture identity, never team-name matching. */
export function orchestrateResultSettlement(
  result: ProviderFinalResult,
  decisions: readonly SettlementCandidate[],
): readonly SettlementInstruction[] {
  if (!result.providerFixtureId) throw new Error("RESULT_IDENTITY_REQUIRED");
  return decisions.map((decision) => ({
    decisionId: decision.decisionId,
    providerFixtureId: result.providerFixtureId,
    outcome: settleDecision({
      market: decision.market,
      selection: decision.selection,
      status: result.status,
      ...(result.homeScore === null ? {} : { homeScore: result.homeScore }),
      ...(result.awayScore === null ? {} : { awayScore: result.awayScore }),
    }),
    observedAt: result.observedAt,
  }));
}
