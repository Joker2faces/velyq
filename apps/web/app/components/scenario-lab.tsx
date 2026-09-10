"use client";

import { useState, type ChangeEvent } from "react";
import { evaluatePriceValidity } from "@velyq/analytics/price-validity";
import {
  formatOdds,
  formatPercent,
  formatPointsDelta,
  priceValidityLabel,
  priceValidityTone,
  translator,
  type Locale,
} from "@velyq/ui";
import { Badge } from "./ui";

/**
 * Scenario Lab: "what price would this need to clear the threshold at?" --
 * a customer-driven hypothetical, computed with the exact same real,
 * tested policy function (`evaluatePriceValidity`) the server uses for the
 * actual verdict, not a fabricated or narrated projection.
 *
 * The model's own probability is fixed and never editable here: a customer
 * adjusting VELYQ's own stated probability would be putting words in the
 * model's mouth. Only the odds -- the one variable a bettor genuinely
 * controls by shopping for a better price -- can be explored.
 */
export function ScenarioLab({
  modelProbability,
  currentOdds,
  locale,
}: {
  modelProbability: string | null;
  currentOdds: string | null;
  locale: Locale;
}) {
  const t = translator(locale);
  const [hypotheticalOdds, setHypotheticalOdds] = useState(currentOdds ?? "2");

  if (modelProbability === null) return null;

  const result = evaluatePriceValidity({
    modelProbability,
    currentOdds: hypotheticalOdds,
  });

  return (
    <div className="scenario-lab">
      <p className="scenario-lab__disclaimer">{t("scenarioLabDisclaimer")}</p>
      <label className="scenario-lab__field">
        <span>{t("scenarioLabOddsLabel")}</span>
        <input
          type="number"
          step="0.01"
          min="1.01"
          value={hypotheticalOdds}
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            /*
             * Cast through `unknown`: this app's tsconfig also includes
             * Cloudflare's `worker-configuration.d.ts` for the Worker
             * runtime code, whose ambient `EventTarget` declaration merges
             * with the DOM lib's and leaves the merged `HTMLInputElement`
             * without `.value` at the type level, even though it is present
             * at runtime (a real `<input>` in a real browser).
             */
            setHypotheticalOdds(
              (event.currentTarget as unknown as { value: string }).value,
            )
          }
        />
      </label>
      <dl className="scenario-lab__figures" aria-live="polite">
        <div>
          <dt>{t("priceValidityCurrent")}</dt>
          <dd>
            {result.currentOdds === null
              ? "—"
              : formatOdds(result.currentOdds, locale)}
          </dd>
        </div>
        <div>
          <dt>{t("edgeColumnEdge")}</dt>
          <dd>{formatPointsDelta(result.probabilityEdge, locale)}</dd>
        </div>
        <div>
          <dt>{t("edgeColumnEv")}</dt>
          <dd>{formatPercent(result.expectedValue, 1, locale)}</dd>
        </div>
        <div>
          <dt>{t("scenarioLabStatus")}</dt>
          <dd>
            <Badge tone={priceValidityTone(result.status)}>
              {priceValidityLabel(result.status, locale)}
            </Badge>
          </dd>
        </div>
      </dl>
    </div>
  );
}
