import type { CustomerRawMatch } from "@velyq/database";
import type { CustomerEvidenceTimelineEventDto } from "@velyq/contracts";
import { chronologicalTimeline } from "@velyq/analytics";
import {
  compareDecimalStrings,
  numericColumnToDecimalString,
  type DecimalString,
} from "@velyq/decimal";

/**
 * Evidence Timeline: the real, ordered sequence of observations behind the
 * headline verdict -- every price instant that actually MOVED the price and
 * every lineup sheet whose status actually CHANGED, nothing inferred or
 * synthesized between them, and no trivial re-confirmation of a fact
 * already on the timeline (mandate section 10: materiality, not every
 * persistence event). Built entirely from data already loaded for Match
 * Intelligence (the headline outcome's own odds history, `raw.lineups`); no
 * new query.
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
        const byInstant = new Map<number, DecimalString[]>();
        for (const observation of headline.odds) {
          const parsed = numericColumnToDecimalString(observation.decimalOdds);
          if (!parsed.ok) continue;
          const at = observation.providerObservedAt.getTime();
          byInstant.set(at, [...(byInstant.get(at) ?? []), parsed.value]);
        }
        const sortedInstants = [...byInstant.entries()].sort(
          ([a], [b]) => a - b,
        );
        const materialEvents: {
          type: "PRICE_OBSERVED";
          at: string;
          sourceId: string;
          price: DecimalString;
          lineupStatus: null;
          team: null;
        }[] = [];
        let previousBest: DecimalString | null = null;
        for (const [at, prices] of sortedInstants) {
          const best = prices.reduce((max, price) => {
            const comparison = compareDecimalStrings(price, max);
            return comparison.ok && comparison.value > 0 ? price : max;
          });
          /*
           * Skip an instant that re-reports the identical best price --
           * a real, checkable price event only exists when the number a
           * customer would actually see has moved.
           */
          const unchanged =
            previousBest !== null &&
            (() => {
              const comparison = compareDecimalStrings(best, previousBest);
              return comparison.ok && comparison.value === 0;
            })();
          if (unchanged) continue;
          previousBest = best;
          materialEvents.push({
            type: "PRICE_OBSERVED" as const,
            at: new Date(at).toISOString(),
            sourceId: `price:${at}`,
            price: best,
            lineupStatus: null,
            team: null,
          });
        }
        return materialEvents;
      })()
    : [];

  const lineupEvents = (() => {
    const sortedLineups = [...raw.lineups].sort(
      (a, b) =>
        a.providerObservedAt.getTime() - b.providerObservedAt.getTime(),
    );
    const materialEvents: {
      type: "LINEUP_OBSERVED";
      at: string;
      sourceId: string;
      price: null;
      lineupStatus: "EXPECTED" | "OFFICIAL" | "CHANGED" | "MISSING";
      team: "HOME" | "AWAY" | null;
    }[] = [];
    /*
     * Tracked per team -- home and away lineups are independent events, so
     * the home side reaching OFFICIAL first must never suppress the away
     * side's own first-seen status.
     */
    const previousStatusByTeam = new Map<string, string>();
    for (const lineup of sortedLineups) {
      /*
       * Skip a lineup poll that reconfirms the same status already on the
       * timeline -- only a real status change (EXPECTED -> OFFICIAL, etc.)
       * is evidence worth showing.
       */
      if (previousStatusByTeam.get(lineup.teamParticipantId) === lineup.status)
        continue;
      previousStatusByTeam.set(lineup.teamParticipantId, lineup.status);
      const side = raw.participants.find(
        (participant) =>
          participant.participant.id === lineup.teamParticipantId,
      );
      materialEvents.push({
        type: "LINEUP_OBSERVED" as const,
        at: lineup.providerObservedAt.toISOString(),
        sourceId: `lineup:${lineup.id}`,
        price: null,
        lineupStatus: lineup.status as
          | "EXPECTED"
          | "OFFICIAL"
          | "CHANGED"
          | "MISSING",
        team:
          side?.eventParticipant.role === "HOME" ||
          side?.eventParticipant.role === "AWAY"
            ? (side.eventParticipant.role as "HOME" | "AWAY")
            : null,
      });
    }
    return materialEvents;
  })();

  return chronologicalTimeline([...priceEvents, ...lineupEvents]).map(
    (event) => event as unknown as CustomerEvidenceTimelineEventDto,
  );
}
