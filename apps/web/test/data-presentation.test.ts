import { describe, expect, it } from "vitest";
import {
  formatOdds,
  formatPercent,
  formatPointsDelta,
  formatProbability,
} from "@velyq/ui";
import { customerToday } from "../app/customer-data";

/**
 * Data-presentation QA.
 *
 * Every figure a customer reads is checked twice here: once that it is
 * derived correctly from the other fields on the same row, and once that it
 * renders as the exact string the UI puts on screen.
 *
 * The reason this file exists: `movementPercent` has changed unit once
 * already. It was stored in percentage points, the presentation layer was
 * built for that, and when the canonical DTO moved to a ratio the UI silently
 * began rendering "-0.1%" instead of "-11.9%" — a hundredfold error that no
 * type check could catch, because both units are a decimal string. Locking
 * the rendered strings makes the next unit change fail loudly.
 */

const TOLERANCE = 5e-4;
const rows = customerToday.matches;

function num(value: string | null): number | null {
  return value === null ? null : Number(value);
}

describe("customer figures are internally consistent", () => {
  it("derives implied probability as 1 / decimal odds", () => {
    for (const match of rows) {
      const odds = num(match.currentOdds);
      const implied = num(match.impliedProbability);
      if (odds === null || implied === null) continue;
      expect(Math.abs(1 / odds - implied)).toBeLessThan(TOLERANCE);
    }
  });

  it("derives fair odds as 1 / model probability", () => {
    for (const match of rows) {
      const model = num(match.modelProbability);
      const fair = num(match.fairOdds);
      if (model === null || fair === null || model === 0) continue;
      expect(Math.abs(1 / model - fair)).toBeLessThan(TOLERANCE);
    }
  });

  it("derives probability edge as model minus market probability", () => {
    for (const match of rows) {
      const model = num(match.modelProbability);
      const implied = num(match.impliedProbability);
      const edge = num(match.probabilityEdge);
      if (model === null || implied === null || edge === null) continue;
      expect(Math.abs(model - implied - edge)).toBeLessThan(TOLERANCE);
    }
  });

  it("derives expected value as probability * odds - 1", () => {
    for (const match of rows) {
      const model = num(match.modelProbability);
      const odds = num(match.currentOdds);
      const expected = num(match.expectedValue);
      if (model === null || odds === null || expected === null) continue;
      expect(Math.abs(model * odds - 1 - expected)).toBeLessThan(TOLERANCE);
    }
  });

  it("stores price movement as a ratio of current to opening", () => {
    for (const match of rows) {
      const opening = num(match.openingOdds);
      const current = num(match.currentOdds);
      const movement = num(match.movementPercent);
      if (opening === null || current === null || movement === null) continue;
      expect(Math.abs(current / opening - 1 - movement)).toBeLessThan(
        TOLERANCE,
      );
    }
  });
});

describe("customer figures render as the intended strings", () => {
  const featured = rows[0]!;

  it("renders the headline row exactly", () => {
    // Northbridge United vs Riverside Athletic — the row the homepage,
    // Today and Match Intelligence all lead with.
    expect(formatOdds(featured.currentOdds)).toBe("1.85");
    expect(formatOdds(featured.openingOdds)).toBe("2.10");
    expect(formatOdds(featured.fairOdds)).toBe("1.67");
    expect(formatProbability(featured.modelProbability)).toBe("60.0%");
    expect(formatProbability(featured.impliedProbability)).toBe("54.1%");
    expect(formatPointsDelta(featured.probabilityEdge)).toBe("+5.9 pp");
    expect(formatPercent(featured.expectedValue)).toBe("+11.0%");
    expect(formatPercent(featured.movementPercent)).toBe("-11.9%");
  });

  it("renders every observed price movement at the right magnitude", () => {
    // Regression guard for the ratio/percentage-point confusion. A movement
    // of a few percent must never render as a fraction of a percent, and
    // never as several hundred percent.
    const rendered = rows
      .filter((match) => match.movementPercent !== null)
      .map((match) => formatPercent(match.movementPercent));
    expect(rendered).toEqual(["-11.9%", "-4.5%", "+5.3%", "+14.3%", "+4.1%"]);
  });

  it("never signs a probability, and always signs a delta", () => {
    for (const match of rows) {
      if (match.modelProbability !== null) {
        expect(formatProbability(match.modelProbability)).not.toMatch(/^[+]/);
      }
      if (match.impliedProbability !== null) {
        expect(formatProbability(match.impliedProbability)).not.toMatch(/^[+]/);
      }
      if (
        match.probabilityEdge !== null &&
        Number(match.probabilityEdge) !== 0
      ) {
        expect(formatPointsDelta(match.probabilityEdge)).toMatch(/^[+-]/);
      }
      if (match.expectedValue !== null && Number(match.expectedValue) !== 0) {
        expect(formatPercent(match.expectedValue)).toMatch(/^[+-]/);
      }
    }
  });

  it("renders a dash wherever the domain has no value", () => {
    const missing = rows.find((match) => match.currentOdds === null)!;
    expect(formatOdds(missing.currentOdds)).toBe("—");
    expect(formatProbability(missing.modelProbability)).toBe("—");
    expect(formatPercent(missing.expectedValue)).toBe("—");
    expect(formatPointsDelta(missing.probabilityEdge)).toBe("—");
  });

  it("always shows odds to two decimals", () => {
    for (const match of rows) {
      for (const value of [
        match.currentOdds,
        match.openingOdds,
        match.fairOdds,
      ]) {
        if (value === null) continue;
        expect(formatOdds(value)).toMatch(/^\d+\.\d{2}$/);
      }
    }
  });
});
