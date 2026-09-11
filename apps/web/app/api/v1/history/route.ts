import { NextResponse } from "next/server";
import { customerFixtureMode, requireCustomerSession } from "../../auth";
import { buildDemoHistory } from "../../../customer/history-data";
import {
  decodeHistoryCursor,
  encodeHistoryCursor,
} from "../../../customer/history-cursor";
import { DatabaseHistoryQueryAdapter } from "@velyq/database";
import { openRuntimeDatabaseSession } from "../../../runtime-database/runtime-database";

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 200;

/** Temporary demo read model; live history is enabled only after migration verification. */
export async function GET(request: Request) {
  const denied = await requireCustomerSession(request, "today.view");
  if (denied) return denied;
  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit"));
  const limit =
    Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
  const cursor = decodeHistoryCursor(url.searchParams.get("cursor"));
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
      /*
       * One extra row fetched, never returned: it is the only cheap way to
       * know a next page exists without a separate COUNT query, and it costs
       * nothing the keyset scan wasn't already going to touch.
       */
      const fetched = await new DatabaseHistoryQueryAdapter(
        session.database,
      ).listDecisions(limit + 1, cursor, false);
      const hasMore = fetched.length > limit;
      const rows = hasMore ? fetched.slice(0, limit) : fetched;
      const lastRow = rows.at(-1);
      const nextCursor =
        hasMore && lastRow
          ? encodeHistoryCursor({
              createdAt: lastRow.decision.createdAt,
              id: lastRow.decision.id,
            })
          : null;
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
          hasMore,
          nextCursor,
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
