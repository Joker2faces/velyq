import { describe, expect, it } from "vitest";
import { recordedAutopsy, renderAutopsy } from "./autopsy-render";

describe("historical quality presentation", () => {
  it.each([
    [
      "en",
      "Quality at decision",
      "Recorded assessment",
      "Policy",
      "Quality reasons",
    ],
    [
      "el",
      "Ποιότητα κατά την απόφαση",
      "Καταγεγραμμένη αξιολόγηση",
      "Πολιτική",
      "Αιτίες ποιότητας",
    ],
  ] as const)(
    "renders labeled evidence and persisted policy in %s",
    (locale, label, assessed, policy, reasons) => {
      const html = renderAutopsy(locale);
      expect(html).toContain(label);
      expect(html).toContain(assessed);
      expect(html).toContain(policy);
      expect(html).toContain(reasons);
      expect(html).toContain("RECORDED_QUALITY · v0");
      expect(html).toContain('dateTime="2026-09-19T11:00:00Z"');
      expect(html).toContain("61.2500");
      expect(html).toContain('class="badge badge--caution">C</span>');
    },
  );

  it.each([
    ["en", "Not recorded"],
    ["el", "Δεν καταγράφηκε"],
  ] as const)("labels missing evidence honestly in %s", (locale, absent) => {
    const html = renderAutopsy(locale, {
      ...recordedAutopsy,
      rows: [{ ...recordedAutopsy.rows[0]!, qualityAtDecision: null }],
    });
    expect(html).toContain(absent);
    expect(html).not.toContain("RECORDED_QUALITY");
    expect(html).not.toContain("61.2500");
  });

  it("omits unrecorded policy and reason details", () => {
    const html = renderAutopsy("en", {
      ...recordedAutopsy,
      rows: [
        {
          ...recordedAutopsy.rows[0]!,
          qualityAtDecision: {
            ...recordedAutopsy.rows[0]!.qualityAtDecision!,
            policy: null,
            reasonCodes: [],
          },
        },
      ],
    });
    expect(html).toContain("Quality at decision");
    expect(html).not.toContain("Policy");
    expect(html).not.toContain("Quality reasons");
  });
});
