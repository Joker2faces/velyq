import { and, desc, eq, lte } from "drizzle-orm";
import type {
  PrivilegedVelyqDatabase,
  RepositoryTransaction,
} from "../client.js";
import {
  dataQualityAssessments,
  dataQualityPolicyVersions,
} from "../schema/intelligence.js";

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
    return this.appendInTransaction(this.database, input);
  }

  async appendInTransaction(
    database: PrivilegedVelyqDatabase | RepositoryTransaction,
    input: PersistQualityAssessmentInput,
  ) {
    const [row] = await database
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
    return this.getLatestAsOfInTransaction(
      this.database,
      eventId,
      asOf,
      marketOutcomeId,
    );
  }

  async getLatestAsOfInTransaction(
    database: PrivilegedVelyqDatabase | RepositoryTransaction,
    eventId: string,
    asOf: Date,
    marketOutcomeId?: string,
  ) {
    const rows = await database
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
      .orderBy(
        desc(dataQualityAssessments.asOf),
        desc(dataQualityAssessments.createdAt),
        desc(dataQualityAssessments.id),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async getPolicyVersion(
    version: string,
    asOf?: Date,
  ): Promise<typeof dataQualityPolicyVersions.$inferSelect | null> {
    return this.getPolicyVersionInTransaction(this.database, version, asOf);
  }

  async getPolicyVersionInTransaction(
    database: PrivilegedVelyqDatabase | RepositoryTransaction,
    version: string,
    asOf?: Date,
  ): Promise<typeof dataQualityPolicyVersions.$inferSelect | null> {
    const rows = await database
      .select()
      .from(dataQualityPolicyVersions)
      .where(
        and(
          eq(dataQualityPolicyVersions.version, version),
          asOf ? lte(dataQualityPolicyVersions.effectiveFrom, asOf) : undefined,
        ),
      )
      .orderBy(
        desc(dataQualityPolicyVersions.effectiveFrom),
        desc(dataQualityPolicyVersions.createdAt),
        desc(dataQualityPolicyVersions.id),
      )
      .limit(1);
    return rows[0] ?? null;
  }
}
