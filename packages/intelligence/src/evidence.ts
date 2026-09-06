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

function compareTimestamp(left: string, right: string): number {
  const leftTimestamp = Date.parse(left);
  const rightTimestamp = Date.parse(right);
  if (!Number.isNaN(leftTimestamp) && !Number.isNaN(rightTimestamp))
    return leftTimestamp - rightTimestamp;
  return left.localeCompare(right);
}

function compareEvidence(
  left: { readonly entry: Evidence; readonly index: number },
  right: { readonly entry: Evidence; readonly index: number },
): number {
  const observed = compareTimestamp(
    left.entry.observedAt,
    right.entry.observedAt,
  );
  if (observed !== 0) return observed;
  const effective = compareTimestamp(
    left.entry.effectiveAt,
    right.entry.effectiveAt,
  );
  if (effective !== 0) return effective;
  const reference = left.entry.referenceId.localeCompare(
    right.entry.referenceId,
  );
  return reference !== 0 ? reference : left.index - right.index;
}

/** Returns the supplied evidence in audit order; it never infers or creates events. */
export function buildEvidenceTimeline(
  evidence: readonly Evidence[],
): readonly Evidence[] {
  return Object.freeze(
    evidence
      .map((entry, index) => ({ entry: freezeEvidence(entry), index }))
      .sort(compareEvidence)
      .map(({ entry }) => entry),
  );
}
