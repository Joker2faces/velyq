import { and, desc, eq, lte } from "drizzle-orm";
import type { PrivilegedVelyqDatabase } from "../client.js";
import { dataQualityAssessments } from "../schema/intelligence.js";

export type PersistQualityAssessmentInput = Readonly<{
  policyVersionId: string;
  eventId: string;
  marketOutcomeId?: string | null;
  asOf: Date;
  grade: string;
  numericScore: string;
  components: Record<string, unknown>;
  reasonCodes: readonly string[];
}>;

/** Append-only quality history with explicit as-of reads. */
export class DatabaseQualityRepository {
  constructor(private readonly database: PrivilegedVelyqDatabase) {}

  async append(input: PersistQualityAssessmentInput) {
    const [row] = await this.database
      .insert(dataQualityAssessments)
      .values({
        policyVersionId: input.policyVersionId,
        eventId: input.eventId,
        marketOutcomeId: input.marketOutcomeId ?? null,
        asOf: input.asOf,
        grade: input.grade,
        numericScore: input.numericScore,
        components: input.components,
        reasonCodes: [...input.reasonCodes],
      })
      .returning();
    if (!row) throw new Error("QUALITY_ASSESSMENT_INSERT_FAILED");
    return row;
  }

  async getLatestAsOf(eventId: string, asOf: Date, marketOutcomeId?: string) {
    const rows = await this.database
      .select()
      .from(dataQualityAssessments)
      .where(
        and(
          eq(dataQualityAssessments.eventId, eventId),
          lte(dataQualityAssessments.asOf, asOf),
          marketOutcomeId
            ? eq(dataQualityAssessments.marketOutcomeId, marketOutcomeId)
            : undefined,
        ),
      )
      .orderBy(desc(dataQualityAssessments.asOf))
      .limit(1);
    return rows[0] ?? null;
  }
}
