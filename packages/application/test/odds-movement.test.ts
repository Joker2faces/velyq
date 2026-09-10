import { describe, expect, it } from "vitest";

import {
  summariseOddsMovement,
  type OddsMovementObservation,
} from "../src/odds-movement.js";

/**
 * Prices arrive as PostgreSQL NUMERIC(18,8), i.e. scale-padded. That padding
 * is the whole reason the original defect existed, so the fixtures here use
 * the real stored form rather than a tidied one.
 */
function at(iso: string, ...prices: string[]): OddsMovementObservation[] {
  return prices.map((decimalOdds) => ({
    decimalOdds,
    providerObservedAt: new Date(iso),
  }));
}

const T1 = "2026-09-09T08:00:00.000Z";
const T2 = "2026-09-09T10:00:00.000Z";
const T3 = "2026-09-09T11:00:00.000Z";

describe("summariseOddsMovement", () => {
  it("reports the owner-observed 1.27 -> 1.30 as a real move, not unchanged", () => {
    /*
     * RADAR showed "1.27 → 1.30 — Price unchanged" in production. Two
     * separate faults produced it: the two prices were different bookmakers
     * at one instant, and the arithmetic that would have contradicted the
     * label failed silently on scale-padded input.
     */
    const summary = summariseOddsMovement([
      ...at(T1, "1.27000000"),
      ...at(T2, "1.30000000"),
    ]);

    expect(summary.state).toBe("MOVED");
    expect(summary.openingOdds).toBe("1.27");
    expect(summary.currentOdds).toBe("1.3");
    /* (1.30 - 1.27) / 1.27 = +2.3622...% */
    expect(Number(summary.movementPercent)).toBeCloseTo(0.023622, 6);
  });

  it("reports the owner-observed 1.07 -> 1.08 as a real move, not unchanged", () => {
    const summary = summariseOddsMovement([
      ...at(T1, "1.07000000"),
      ...at(T2, "1.08000000"),
    ]);

    expect(summary.state).toBe("MOVED");
    expect(Number(summary.movementPercent)).toBeCloseTo(0.009346, 6);
  });

  it("reports a genuinely flat price as unchanged", () => {
    const summary = summariseOddsMovement([
      ...at(T1, "1.25000000"),
      ...at(T2, "1.25000000"),
    ]);

    expect(summary.state).toBe("UNCHANGED");
    expect(summary.movementPercent).toBe("0");
  });

  it("refuses to call one instant's bookmaker spread a movement", () => {
    /*
     * The production shape: a single provider response yields one
     * observation per bookmaker, all sharing the provider's observation
     * time. There is a current price and no history.
     */
    const summary = summariseOddsMovement(
      at(T1, "1.27000000", "1.30000000", "1.28000000"),
    );

    expect(summary.state).toBe("INSUFFICIENT_HISTORY");
    expect(summary.observationTimes).toBe(1);
    expect(summary.movementPercent).toBeNull();
    /* Opening is withheld so no surface can render a false comparison. */
    expect(summary.openingOdds).toBeNull();
    /* Best price on offer at that instant is still real and still useful. */
    expect(summary.currentOdds).toBe("1.3");
  });

  it("orders by provider observation time, not by arrival order", () => {
    /*
     * A late payload describing an earlier moment must land in its own
     * chronological place. Ingestion order would invert opening and current
     * and invent movement in the wrong direction.
     */
    const outOfOrder = [
      ...at(T2, "1.30000000"),
      ...at(T1, "1.27000000"),
      ...at(T3, "1.35000000"),
    ];

    const summary = summariseOddsMovement(outOfOrder);

    expect(summary.openingOdds).toBe("1.27");
    expect(summary.currentOdds).toBe("1.35");
    expect(summary.state).toBe("MOVED");
    expect(Number(summary.movementPercent)).toBeGreaterThan(0);
  });

  it("keeps movement identical however the observations are shuffled", () => {
    const observations = [
      ...at(T1, "2.10000000", "2.05000000"),
      ...at(T2, "1.85000000", "1.90000000"),
    ];
    const reversed = [...observations].reverse();

    expect(summariseOddsMovement(reversed)).toEqual(
      summariseOddsMovement(observations),
    );
  });

  it("compares best price to best price across instants", () => {
    const summary = summariseOddsMovement([
      ...at(T1, "1.90000000", "2.10000000"),
      ...at(T2, "1.80000000", "2.00000000"),
    ]);

    expect(summary.openingOdds).toBe("2.1");
    expect(summary.currentOdds).toBe("2");
    /* Shortening price: negative movement. */
    expect(Number(summary.movementPercent)).toBeLessThan(0);
  });

  it("has nothing to say about an outcome with no observations", () => {
    const summary = summariseOddsMovement([]);
    expect(summary.state).toBe("INSUFFICIENT_HISTORY");
    expect(summary.currentOdds).toBeNull();
    expect(summary.observationTimes).toBe(0);
  });

  it("never reports a movement figure while claiming insufficient history", () => {
    /*
     * The invariant the production contradiction violated: the state and the
     * number must agree, whatever the input.
     */
    const inputs: OddsMovementObservation[][] = [
      [],
      at(T1, "1.50000000"),
      at(T1, "1.50000000", "1.60000000"),
      [...at(T1, "1.50000000"), ...at(T2, "1.60000000")],
      [...at(T1, "1.50000000"), ...at(T2, "1.50000000")],
      [...at(T1, "not-a-price"), ...at(T2, "1.60000000")],
    ];

    for (const input of inputs) {
      const summary = summariseOddsMovement(input);
      if (summary.state === "INSUFFICIENT_HISTORY") {
        expect(summary.movementPercent).toBeNull();
      } else {
        expect(summary.movementPercent).not.toBeNull();
        expect(summary.openingOdds).not.toBeNull();
      }
    }
  });

  it("treats an unparseable price as missing rather than as a zero", () => {
    const summary = summariseOddsMovement([
      ...at(T1, "not-a-price"),
      ...at(T2, "1.60000000"),
    ]);

    expect(summary.openingOdds).toBeNull();
    expect(summary.state).toBe("INSUFFICIENT_HISTORY");
  });

  describe("bookmakerCount", () => {
    it("counts distinct bookmakers behind the current price, not rows", () => {
      const summary = summariseOddsMovement([
        {
          decimalOdds: "1.90000000",
          providerObservedAt: new Date(T1),
          bookmakerId: "book-a",
        },
        {
          decimalOdds: "1.90000000",
          providerObservedAt: new Date(T1),
          bookmakerId: "book-a",
        },
        {
          decimalOdds: "1.85000000",
          providerObservedAt: new Date(T1),
          bookmakerId: "book-b",
        },
      ]);

      expect(summary.bookmakerCount).toBe(2);
    });

    it("only counts bookmakers observed at the latest instant", () => {
      const summary = summariseOddsMovement([
        {
          decimalOdds: "2.10000000",
          providerObservedAt: new Date(T1),
          bookmakerId: "book-a",
        },
        {
          decimalOdds: "2.10000000",
          providerObservedAt: new Date(T1),
          bookmakerId: "book-b",
        },
        {
          decimalOdds: "2.00000000",
          providerObservedAt: new Date(T2),
          bookmakerId: "book-a",
        },
      ]);

      expect(summary.bookmakerCount).toBe(1);
    });

    it("is zero when no bookmaker identity was supplied", () => {
      const summary = summariseOddsMovement(at(T1, "1.90000000"));
      expect(summary.bookmakerCount).toBe(0);
    });

    it("is zero for an outcome with no observations", () => {
      expect(summariseOddsMovement([]).bookmakerCount).toBe(0);
    });
  });
});
