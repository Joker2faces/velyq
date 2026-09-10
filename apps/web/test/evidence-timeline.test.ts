import { describe, expect, it } from "vitest";
import type { CustomerRawMatch } from "@velyq/database";
import { mapMatch } from "../app/customer-database";
import { buildEvidenceTimeline } from "../app/evidence-timeline";

/**
 * Evidence Timeline: the real, ordered sequence of price and lineup
 * observations behind the headline verdict. Built entirely from data
 * already loaded for Match Intelligence -- no new query -- via
 * `chronologicalTimeline` (packages/analytics), which existed fully tested
 * but had no caller anywhere before this.
 */

const ASOF = new Date("2026-09-20T12:00:00.000Z");

function raw(): CustomerRawMatch {
  const outcomeId = "outcome-home";
  return {
    event: { id: "event-1", startsAt: ASOF } as CustomerRawMatch["event"],
    sport: {} as CustomerRawMatch["sport"],
    competition: {
      nameKey: "competition.test",
    } as CustomerRawMatch["competition"],
    participants: [
      {
        participant: { id: "team-home", displayName: "Home FC" },
        eventParticipant: { role: "HOME" },
      },
      {
        participant: { id: "team-away", displayName: "Away FC" },
        eventParticipant: { role: "AWAY" },
      },
    ] as unknown as CustomerRawMatch["participants"],
    lineups: [
      {
        id: "lineup-1",
        eventId: "event-1",
        teamParticipantId: "team-home",
        status: "EXPECTED",
        providerObservedAt: new Date("2026-09-20T10:00:00.000Z"),
      },
      {
        id: "lineup-2",
        eventId: "event-1",
        teamParticipantId: "team-home",
        status: "OFFICIAL",
        providerObservedAt: new Date("2026-09-20T11:00:00.000Z"),
      },
    ] as unknown as CustomerRawMatch["lineups"],
    outcomes: [
      {
        market: {
          lineValue: null,
        } as CustomerRawMatch["outcomes"][number]["market"],
        marketDefinition: {
          code: "FOOTBALL_FULL_TIME_1X2",
          labelKey: "market.football_full_time_1x2",
        } as CustomerRawMatch["outcomes"][number]["marketDefinition"],
        outcome: {
          id: outcomeId,
        } as CustomerRawMatch["outcomes"][number]["outcome"],
        outcomeDefinition: {
          code: "HOME",
        } as CustomerRawMatch["outcomes"][number]["outcomeDefinition"],
        prediction: null,
        predictionInputs: [],
        quality: null,
        score: null,
        odds: [
          {
            decimalOdds: "2",
            providerObservedAt: new Date("2026-09-20T09:00:00.000Z"),
            isSynthetic: false,
            bookmakerId: "book-a",
          },
          {
            decimalOdds: "1.9",
            providerObservedAt: new Date("2026-09-20T10:30:00.000Z"),
            isSynthetic: false,
            bookmakerId: "book-a",
          },
        ] as unknown as CustomerRawMatch["outcomes"][number]["odds"],
      },
    ],
    asOf: ASOF,
  };
}

describe("evidence timeline", () => {
  it("orders real price and lineup observations chronologically", () => {
    const dto = mapMatch(raw());
    expect(dto.evidenceTimeline).toBeDefined();
    const types = dto.evidenceTimeline!.map((event) => event.type);
    // 09:00 price, 10:00 lineup(EXPECTED), 10:30 price, 11:00 lineup(OFFICIAL)
    expect(types).toEqual([
      "PRICE_OBSERVED",
      "LINEUP_OBSERVED",
      "PRICE_OBSERVED",
      "LINEUP_OBSERVED",
    ]);
  });

  it("carries the real price and lineup status for each event, never inferred", () => {
    const dto = mapMatch(raw());
    const events = dto.evidenceTimeline!;
    expect(events[0]).toMatchObject({ type: "PRICE_OBSERVED", price: "2" });
    expect(events[1]).toMatchObject({
      type: "LINEUP_OBSERVED",
      lineupStatus: "EXPECTED",
      team: "HOME",
    });
  });

  it("is empty, not fabricated, for a fixture with no evidence yet", () => {
    const empty = raw();
    const emptied: CustomerRawMatch = {
      ...empty,
      lineups: [],
      outcomes: [{ ...empty.outcomes[0]!, odds: [] }],
    };
    const dto = mapMatch(emptied);
    expect(dto.evidenceTimeline).toEqual([]);
  });

  it("never fills the timeline with a price re-observation that did not move the price", () => {
    const data = raw();
    const outcome = data.outcomes[0]!;
    const events = buildEvidenceTimeline(
      {
        ...data,
        outcomes: [
          {
            ...outcome,
            odds: [
              {
                decimalOdds: "2",
                providerObservedAt: new Date("2026-09-20T09:00:00.000Z"),
                isSynthetic: false,
                bookmakerId: "book-a",
              },
              // Same price, later instant: a real persisted observation,
              // but not a material price event.
              {
                decimalOdds: "2",
                providerObservedAt: new Date("2026-09-20T09:15:00.000Z"),
                isSynthetic: false,
                bookmakerId: "book-a",
              },
              // Genuine move: must appear.
              {
                decimalOdds: "1.9",
                providerObservedAt: new Date("2026-09-20T09:30:00.000Z"),
                isSynthetic: false,
                bookmakerId: "book-a",
              },
            ] as unknown as CustomerRawMatch["outcomes"][number]["odds"],
          },
        ],
        lineups: [],
      },
      outcome.outcome.id,
    );
    const priceEvents = events.filter(
      (event) => event.type === "PRICE_OBSERVED",
    );
    expect(priceEvents).toHaveLength(2);
    expect(priceEvents.map((event) => event.price)).toEqual(["2", "1.9"]);
  });

  it("never fills the timeline with a lineup poll that reconfirms an unchanged status", () => {
    const data = raw();
    const events = buildEvidenceTimeline(
      {
        ...data,
        lineups: [
          {
            id: "lineup-1",
            eventId: "event-1",
            teamParticipantId: "team-home",
            status: "EXPECTED",
            providerObservedAt: new Date("2026-09-20T10:00:00.000Z"),
          },
          // Same status, later poll: not material.
          {
            id: "lineup-2",
            eventId: "event-1",
            teamParticipantId: "team-home",
            status: "EXPECTED",
            providerObservedAt: new Date("2026-09-20T10:15:00.000Z"),
          },
          // Genuine status change: must appear.
          {
            id: "lineup-3",
            eventId: "event-1",
            teamParticipantId: "team-home",
            status: "OFFICIAL",
            providerObservedAt: new Date("2026-09-20T10:30:00.000Z"),
          },
        ] as unknown as CustomerRawMatch["lineups"],
      },
      data.outcomes[0]!.outcome.id,
    );
    const lineupEvents = events.filter(
      (event) => event.type === "LINEUP_OBSERVED",
    );
    expect(lineupEvents).toHaveLength(2);
    expect(lineupEvents.map((event) => event.lineupStatus)).toEqual([
      "EXPECTED",
      "OFFICIAL",
    ]);
  });

  it("tracks lineup materiality independently per team, never letting one side's status suppress the other's", () => {
    const data = raw();
    const events = buildEvidenceTimeline(
      {
        ...data,
        lineups: [
          {
            id: "lineup-home",
            eventId: "event-1",
            teamParticipantId: "team-home",
            status: "EXPECTED",
            providerObservedAt: new Date("2026-09-20T10:00:00.000Z"),
          },
          // Different team, same status: a real, distinct first-seen event.
          {
            id: "lineup-away",
            eventId: "event-1",
            teamParticipantId: "team-away",
            status: "EXPECTED",
            providerObservedAt: new Date("2026-09-20T10:00:00.000Z"),
          },
        ] as unknown as CustomerRawMatch["lineups"],
      },
      data.outcomes[0]!.outcome.id,
    );
    const lineupEvents = events.filter(
      (event) => event.type === "LINEUP_OBSERVED",
    );
    expect(lineupEvents).toHaveLength(2);
    expect(new Set(lineupEvents.map((event) => event.team))).toEqual(
      new Set(["HOME", "AWAY"]),
    );
  });
});
