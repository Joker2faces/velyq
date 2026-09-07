import { describe, expect, it } from "vitest";
import {
  CALIBRATION_BANDS,
  DECISION_QUALITIES,
  MINIMUM_REPORTABLE_SAMPLE,
  MODEL_MATURITIES,
  OUTCOME_RESULTS,
  SPORTS,
  calibrationLabel,
  calibrationTone,
  clvDirection,
  clvLabel,
  decisionQualityLabel,
  decisionQualityTone,
  isReportableSample,
  isSport,
  modelMaturityLabel,
  modelMaturityTone,
  outcomeLabel,
  outcomeTone,
  sampleSizeCaption,
  sportLabel,
  sportScope,
  type Locale,
} from "../src/index.js";

const LOCALES: readonly Locale[] = ["en", "el"];

describe("sport scope", () => {
  it("labels every sport in both languages", () => {
    for (const locale of LOCALES) {
      for (const sport of SPORTS) {
        const label = sportLabel(sport, locale);
        expect(label).not.toBe(sport);
        expect(label).not.toContain("_");
        expect(label.trim()).not.toBe("");
      }
    }
  });

  it("degrades an unknown sport to a readable form", () => {
    expect(sportLabel("ICE_HOCKEY", "en")).toBe("Ice hockey");
    expect(isSport("ICE_HOCKEY")).toBe(false);
    expect(isSport("FOOTBALL")).toBe(true);
  });

  it("states one sport instead of offering a choice", () => {
    /*
     * A selector needs somewhere to switch to. With football alone the sport
     * is context, and rendering it as a control would present a tab bar with
     * one inert tab.
     */
    expect(sportScope(["FOOTBALL"])).toEqual({
      kind: "single",
      sport: "FOOTBALL",
    });
  });

  it("offers a selector only once a second sport has data behind it", () => {
    /*
     * The property that matters: derived from the sports that actually carry
     * data, so the selector appears the day basketball does and cannot appear
     * before. A tab for a sport with nothing behind it promises coverage that
     * does not exist.
     */
    expect(sportScope(["FOOTBALL", "BASKETBALL"])).toEqual({
      kind: "select",
      sports: ["FOOTBALL", "BASKETBALL"],
      active: "FOOTBALL",
    });
  });

  it("honours a valid active sport and ignores an invalid one", () => {
    const scope = sportScope(["FOOTBALL", "BASKETBALL"], "BASKETBALL");
    expect(scope).toMatchObject({ kind: "select", active: "BASKETBALL" });
    const fallback = sportScope(["FOOTBALL", "BASKETBALL"], "TENNIS");
    expect(fallback).toMatchObject({ kind: "select", active: "FOOTBALL" });
  });

  it("renders nothing when no sport is available", () => {
    expect(sportScope([])).toEqual({ kind: "none" });
    expect(sportScope(["", "  "])).toEqual({ kind: "none" });
  });

  it("does not repeat a sport offered twice", () => {
    expect(sportScope(["FOOTBALL", "FOOTBALL"])).toEqual({
      kind: "single",
      sport: "FOOTBALL",
    });
  });
});

describe("track record", () => {
  it("labels every outcome, decision, calibration band and maturity", () => {
    for (const locale of LOCALES) {
      for (const code of OUTCOME_RESULTS) {
        expect(outcomeLabel(code, locale)).not.toBe(code);
      }
      for (const code of DECISION_QUALITIES) {
        const label = decisionQualityLabel(code, locale);
        expect(label).not.toBe(code);
        expect(label).not.toContain("_");
      }
      for (const code of CALIBRATION_BANDS) {
        expect(calibrationLabel(code, locale)).not.toBe(code);
      }
      for (const code of MODEL_MATURITIES) {
        expect(modelMaturityLabel(code, locale)).not.toBe(code);
      }
    }
  });

  /*
   * The single most important assertion in this file.
   *
   * A track record becomes gamification the moment a win is celebrated. If a
   * won market ever takes the positive tone it takes the brand accent, and the
   * page starts rewarding the reader for results instead of showing them
   * evidence. Results are stated; the accent stays with the model.
   */
  it("never colours a result as a success", () => {
    expect(outcomeTone("WON")).toBe("neutral");
    expect(outcomeTone("LOST")).toBe("neutral");
    expect(outcomeTone("WON")).toBe(outcomeTone("LOST"));
    for (const code of OUTCOME_RESULTS) {
      expect(outcomeTone(code)).not.toBe("positive");
      expect(outcomeTone(code)).not.toBe("negative");
    }
  });

  it("keeps decision quality on a different axis from the result", () => {
    /*
     * Decision quality is what VELYQ is accountable for and is the only axis
     * that may carry the accent, because it is knowable before the result and
     * cannot be revised after it. A sound decision that lost must still read
     * as sound.
     */
    expect(decisionQualityTone("FORTRESS")).toBe("positive");
    expect(decisionQualityTone("EDGE")).toBe("positive");
    expect(decisionQualityTone("MARGINAL")).toBe("caution");
    expect(decisionQualityTone("NO_EDGE")).toBe("muted");
    expect(decisionQualityTone("EDGE")).not.toBe(outcomeTone("WON"));
  });

  it("distinguishes a push from a void", () => {
    /*
     * A push settled and returned the stake; a void never settled. Reporting
     * either as the other misstates the sample the rates are drawn from.
     */
    expect(outcomeLabel("PUSH", "en")).not.toBe(outcomeLabel("VOID", "en"));
    expect(outcomeLabel("PUSH", "el")).not.toBe(outcomeLabel("VOID", "el"));
  });

  it("reads closing line value as a direction, not a verdict", () => {
    expect(clvDirection("0.031")).toBe("beat");
    expect(clvDirection("-0.024")).toBe("missed");
    expect(clvDirection("0")).toBe("matched");
    for (const missing of [null, undefined, "", "   ", "not-a-number"]) {
      expect(clvDirection(missing)).toBe("unknown");
    }
    for (const locale of LOCALES) {
      expect(clvLabel("unknown", locale)).not.toBe("");
      expect(clvLabel("beat", locale)).not.toBe(clvLabel("missed", locale));
    }
  });

  it("qualifies a rate drawn from too few settled signals", () => {
    expect(isReportableSample(MINIMUM_REPORTABLE_SAMPLE)).toBe(true);
    expect(isReportableSample(MINIMUM_REPORTABLE_SAMPLE - 1)).toBe(false);
    expect(isReportableSample(0)).toBe(false);
    expect(isReportableSample(Number.NaN)).toBe(false);

    for (const locale of LOCALES) {
      /* The count is always named, whichever side of the threshold it is on:
         "a hit rate" over eleven signals is not a hit rate. */
      expect(sampleSizeCaption(11, locale)).toContain("11");
      expect(sampleSizeCaption(400, locale)).toContain("400");
      expect(sampleSizeCaption(11, locale)).not.toBe(
        sampleSizeCaption(400, locale),
      );
    }
  });

  it("treats calibration and maturity as qualifications, not accolades", () => {
    expect(calibrationTone("INSUFFICIENT")).toBe("muted");
    expect(calibrationTone("DRIFTING")).toBe("caution");
    expect(modelMaturityTone("EARLY")).toBe("muted");
    expect(modelMaturityTone("PROVISIONAL")).toBe("caution");
  });

  it("states no performance figure of its own", () => {
    /*
     * Every number on a record surface comes from the data layer. There is no
     * validated history yet, so a default, example or placeholder figure
     * hidden in this module would be a fabricated performance claim — and the
     * hardest kind to notice later.
     */
    for (const locale of LOCALES) {
      for (const label of [
        ...OUTCOME_RESULTS.map((code) => outcomeLabel(code, locale)),
        ...DECISION_QUALITIES.map((code) => decisionQualityLabel(code, locale)),
        ...CALIBRATION_BANDS.map((code) => calibrationLabel(code, locale)),
        ...MODEL_MATURITIES.map((code) => modelMaturityLabel(code, locale)),
      ]) {
        expect(label).not.toMatch(/\d/);
      }
    }
    expect(sampleSizeCaption(0, "en")).toContain("0");
  });
});
