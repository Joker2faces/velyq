import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PostMatchAutopsy } from "../app/components/match";
import type { PostMatchAutopsyDto } from "../app/customer-runtime";

export const recordedAutopsy: PostMatchAutopsyDto = {
  finalScore: "2–0",
  rows: [
    {
      marketLabelKey: "market.football_full_time_1x2",
      lineValue: null,
      selection: "HOME",
      decisionStatus: "STRONG_EDGE",
      whyNotCodes: [],
      decidedAt: "2026-09-19T12:00:00Z",
      modelProbability: "0.5",
      impliedProbabilityAtDecision: "0.454545",
      fairOdds: "2",
      offeredOdds: "2.2",
      minimumAcceptableOddsAtDecision: "2.1",
      priceValidityPolicyVersion: "price-validity.v1",
      outcome: "WIN",
      closingOdds: "2",
      clv: "0.1",
      qualityAtDecision: {
        grade: "C",
        score: "61.2500",
        assessedAt: "2026-09-19T11:00:00Z",
        policy: { code: "RECORDED_QUALITY", version: "v0" },
        reasonCodes: ["STALE_DATA"],
      },
    },
  ],
};

export function renderAutopsy(locale: "en" | "el", autopsy = recordedAutopsy) {
  return renderToStaticMarkup(
    createElement(PostMatchAutopsy, { autopsy, locale }),
  );
}
