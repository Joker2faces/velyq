import type { CustomerRawMatch } from "@velyq/database";
import type { CustomerEvidenceTimelineEventDto } from "@velyq/contracts";
import { chronologicalTimeline } from "@velyq/analytics";
import { numericColumnToDecimalString } from "@velyq/decimal";

/**
 * Evidence Timeline: the real, ordered sequence of observations behind the
 * headline verdict -- every distinct price instant and every lineup sheet
 * this fixture has actually had, nothing inferred or synthesized between
 * them. Built entirely from data already loaded for Match Intelligence (the
 * headline outcome's own odds history, `raw.lineups`); no new query.
 *
 * `chronologicalTimeline` (packages/analytics) already implements the
 * ordering rule (`at` ascending, `sourceId` as a stable tiebreaker) and had
 * no caller anywhere before this -- the same unwired-but-tested pattern
 * this session found repeatedly in market-semantics and analytics.
 */
export function buildEvidenceTimeline(
  raw: CustomerRawMatch,
  headlineOutcomeId: string | undefined,
): readonly CustomerEvidenceTimelineEventDto[] {
  const headline = raw.outcomes.find((outcome) => outcome.outcome.id === headlineOutcomeId);

  const priceEvents = headline
    ? (() => {
        const byInstant = new Map<number, string[]>();
        for (const observation of headline.odds) {
          const parsed = numericColumnToDecimalString(observation.decimalOdds);
          if (!parsed.ok) continue;
          const at = observation.providerObservedAt.getTime();
          byInstant.set(at, [...(byInstant.get(at) ?? []), parsed.value]);
        }
        return [...byInstant.entries()].map(([at, prices]) => {
          const best = prices.reduce((max, price) =>
            Number(price) > Number(max) ? price : max,
          );
          return {
            type: "PRICE_OBSERVED" as const,
            at: new Date(at).toISOString(),
            sourceId: `price:${at}`,
            price: best,
            lineupStatus: null,
            team: null,
          };
        });
      })()
    : [];

  const lineupEvents = raw.lineups.map((lineup) => {
    const side = raw.participants.find(
      (participant) => participant.participant.id === lineup.teamParticipantId,
    );
    return {
      type: "LINEUP_OBSERVED" as const,
      at: lineup.providerObservedAt.toISOString(),
      sourceId: `lineup:${lineup.id}`,
      price: null,
      lineupStatus: lineup.status as "EXPECTED" | "OFFICIAL" | "CHANGED" | "MISSING",
      team:
        side?.eventParticipant.role === "HOME" ||
        side?.eventParticipant.role === "AWAY"
          ? (side.eventParticipant.role as "HOME" | "AWAY")
          : null,
    };
  });

  return chronologicalTimeline([...priceEvents, ...lineupEvents]).map(
    (event) => event as unknown as CustomerEvidenceTimelineEventDto,
  );
}
