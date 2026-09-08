import { and, eq } from "drizzle-orm";
import type {
  ProviderFinalResult,
  SettlementInstruction,
} from "@velyq/application";
import type { PrivilegedVelyqDatabase } from "../client.js";
import { eventIdentities } from "../schema/catalog.js";
import { eventResults, marketSettlements } from "../schema/intelligence.js";

export class DatabaseResultSettlementRepository {
  constructor(private readonly database: PrivilegedVelyqDatabase) {}

  /**
   * Appends a provider result correction and its derived settlements in one
   * transaction. Existing result/settlement rows are never updated.
   */
  async append(
    input: Readonly<{
      providerId: string;
      sourceObservationId: string;
      result: ProviderFinalResult;
      settlements: readonly SettlementInstruction[];
      settlementRuleVersion: string;
      closingByDecisionId?: Readonly<
        Record<string, Readonly<{ odds: string; clv: string | null }>>
      >;
    }>,
  ) {
    return this.database.transaction(async (transaction) => {
      const [identity] = await transaction
        .select({ eventId: eventIdentities.eventId })
        .from(eventIdentities)
        .where(
          and(
            eq(eventIdentities.providerId, input.providerId),
            eq(
              eventIdentities.providerFixtureId,
              input.result.providerFixtureId,
            ),
          ),
        )
        .limit(1);
      if (!identity) throw new Error("RESULT_EVENT_IDENTITY_NOT_FOUND");
      const [storedResult] = await transaction
        .insert(eventResults)
        .values({
          eventId: identity.eventId,
          sourceObservationId: input.sourceObservationId,
          status: input.result.status,
          homeScore: input.result.homeScore,
          awayScore: input.result.awayScore,
          providerObservedAt: new Date(input.result.observedAt),
        })
        .onConflictDoNothing({
          target: [eventResults.sourceObservationId, eventResults.eventId],
        })
        .returning();
      const resultRow =
        storedResult ??
        (
          await transaction
            .select()
            .from(eventResults)
            .where(
              and(
                eq(eventResults.sourceObservationId, input.sourceObservationId),
                eq(eventResults.eventId, identity.eventId),
              ),
            )
            .limit(1)
        )[0];
      if (!resultRow) throw new Error("RESULT_PERSISTENCE_FAILED");
      const persisted = [];
      for (const settlement of input.settlements) {
        const closing = input.closingByDecisionId?.[settlement.decisionId];
        const [row] = await transaction
          .insert(marketSettlements)
          .values({
            decisionId: settlement.decisionId,
            eventResultId: resultRow.id,
            outcome: settlement.outcome,
            settlementRuleVersion: input.settlementRuleVersion,
            closingOdds: closing?.odds ?? null,
            clv: closing?.clv ?? null,
            settledAt: new Date(settlement.observedAt),
          })
          .onConflictDoNothing({
            target: [
              marketSettlements.decisionId,
              marketSettlements.eventResultId,
            ],
          })
          .returning();
        if (row) persisted.push(row);
      }
      return { result: resultRow, settlements: persisted } as const;
    });
  }
}
