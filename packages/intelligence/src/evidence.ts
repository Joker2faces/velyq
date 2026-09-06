export type EvidenceType =
  "PRICE" | "MODEL" | "LINEUP" | "INJURY" | "TEAM_NEWS" | "MARKET";

export type EvidenceFreshness = "FRESH" | "STALE" | "MISSING";

export type EvidenceStatus =
  "AVAILABLE" | "SUPERSEDED" | "RETRACTED" | "MISSING";

export type Evidence = Readonly<{
  readonly type: EvidenceType;
  readonly source: string;
  readonly observedAt: string;
  readonly effectiveAt: string;
  readonly freshness: EvidenceFreshness;
  readonly referenceId: string;
  readonly status: EvidenceStatus;
}>;

function freezeEvidence(evidence: Evidence): Evidence {
  return Object.freeze({ ...evidence });
}

/** Returns the supplied evidence in audit order; it never infers or creates events. */
export function buildEvidenceTimeline(
  evidence: readonly Evidence[],
): readonly Evidence[] {
  return Object.freeze(
    evidence
      .map((entry, index) => ({ entry: freezeEvidence(entry), index }))
      .sort((left, right) => {
        const observed = left.entry.observedAt.localeCompare(
          right.entry.observedAt,
        );
        if (observed !== 0) return observed;
        const effective = left.entry.effectiveAt.localeCompare(
          right.entry.effectiveAt,
        );
        return effective !== 0 ? effective : left.index - right.index;
      })
      .map(({ entry }) => entry),
  );
}
