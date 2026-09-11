/** Recorded evidence only; an absent assessment or policy stays absent. */
export type HistoricalQualityDto = Readonly<{
  grade: string;
  score: string;
  assessedAt: string;
  reasonCodes: readonly string[];
  policy: Readonly<{ code: string; version: string }> | null;
}>;
