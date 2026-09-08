import { NextResponse } from "next/server";
import { customerFixtureMode, requireCustomerSession } from "../../auth";
import { buildDemoHistory } from "../../../customer/history-data";
import { DatabaseHistoryQueryAdapter } from "@velyq/database";
import { openRuntimeDatabaseSession } from "../../../runtime-database/runtime-database";

/** Temporary demo read model; live history is enabled only after migration verification. */
export async function GET(request: Request) {
  const denied = await requireCustomerSession(request, "today.view");
  if (denied) return denied;
  const liveMode =
    !customerFixtureMode() &&
    process.env["VELYQ_CUSTOMER_INTELLIGENCE_MODE"] !== "SYNTHETIC_DEMO";
  if (liveMode) {
    const session = await openRuntimeDatabaseSession();
    if (!session)
      return NextResponse.json(
        {
          type: "https://velyq.dev/problems/history-unavailable",
          title: "Live decision history is unavailable",
          status: 503,
          code: "HISTORY_UNAVAILABLE",
          requestId: crypto.randomUUID(),
        },
        { status: 503, headers: { "cache-control": "private, no-store" } },
      );
    try {
      const rows = await new DatabaseHistoryQueryAdapter(
        session.database,
      ).listDecisions();
      const modelVersions = [
        ...new Set(rows.map((row) => row.forecast.modelVersion)),
      ];
      return NextResponse.json(
        {
          syntheticLabel: "Live data",
          asOf: new Date().toISOString(),
          period: "All persisted qualifying decisions",
          modelVersion:
            modelVersions.length === 1
              ? modelVersions[0]
              : "Multiple model versions",
          decisions: rows.map((row) => ({
            id: row.decision.id,
            decidedAt: row.decision.createdAt.toISOString(),
            competition: row.competition.nameKey,
            homeTeam: row.homeTeam,
            awayTeam: row.awayTeam,
            market: row.marketDefinition.labelKey,
            selection: row.decision.selection,
            decisionState: row.decision.status,
            modelProbability: row.forecast.probability,
            oddsAtDecision: row.decision.offeredOdds,
            fairOdds: row.decision.fairOdds,
            expectedValue: row.decision.expectedValue,
            finalScore:
              row.result?.homeScore == null || row.result.awayScore == null
                ? "—"
                : `${row.result.homeScore}–${row.result.awayScore}`,
            settlement: row.settlement?.outcome ?? "UNSETTLED",
            closingOdds: row.settlement?.closingOdds ?? null,
            clv: row.settlement?.clv ?? null,
            modelVersion: row.forecast.modelVersion,
            priceQuality:
              row.settlement?.clv == null
                ? "UNAVAILABLE"
                : Number(row.settlement.clv) > 0
                  ? "POSITIVE_CLV"
                  : "NEGATIVE_CLV",
          })),
        },
        { headers: { "cache-control": "private, no-store" } },
      );
    } catch {
      return NextResponse.json(
        {
          type: "https://velyq.dev/problems/history-unavailable",
          title: "Live decision history is unavailable",
          status: 503,
          code: "HISTORY_UNAVAILABLE",
          requestId: crypto.randomUUID(),
        },
        { status: 503, headers: { "cache-control": "private, no-store" } },
      );
    } finally {
      await session.close();
    }
  }
  return NextResponse.json(buildDemoHistory(new Date()), {
    headers: { "cache-control": "private, no-store" },
  });
}
