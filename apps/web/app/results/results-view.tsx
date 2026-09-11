"use client";
import { useState } from "react";
import { trackRecord } from "@velyq/analytics";
import {
  competitionLabel,
  formatOdds,
  formatPercent,
  intlLocale,
  marketLabel,
  recommendationLabel,
  selectionLabel,
  translator,
  type Locale,
} from "@velyq/ui";
import type {
  DecisionHistoryItem,
  HistoryModelVersion,
  HistorySurfaceDto,
} from "../customer/history-surface";
import { Badge, Card, CardHead, Stat } from "../components/ui";

/**
 * Label bundle for this view.
 *
 * These live in the shared message catalog rather than in a local
 * `locale === "el"` object, so that a missing Greek string is a compile error
 * in `messages.ts` instead of English prose leaking onto a Greek page.
 */
const copy = (locale: Locale) => {
  const t = translator(locale);
  return {
    title: t("historyTitle"),
    sub: t("historySubtitle"),
    settled: t("historySettled"),
    wins: t("historyWins"),
    losses: t("historyLosses"),
    clv: t("historyPositiveClv"),
    avgClv: t("historyAverageClv"),
    outcome: t("historyOutcome"),
    price: t("historyPriceQuality"),
    demo: t("historySyntheticSample"),
    live: t("historyLiveData"),
    all: t("historyAllQualifying"),
    model: t("historyModel"),
    modelVersion: (value: HistoryModelVersion) => {
      if (value.state === "NONE") return t("historyModelVersionNone");
      if (value.state === "MULTIPLE")
        return t("historyModelVersionMultiple", { count: value.count });
      return value.version;
    },
    periodDemo: t("historyPeriodDemo"),
    periodAll: t("historyPeriodAll"),
    settlement: {
      WIN: t("historySettlementWin"),
      LOSS: t("historySettlementLoss"),
      VOID: t("historySettlementVoid"),
      UNSETTLED: t("historySettlementUnsettled"),
    },
    priceQuality: {
      POSITIVE_CLV: t("historyPricePositive"),
      NEGATIVE_CLV: t("historyPriceNegative"),
      UNAVAILABLE: t("historyPriceUnavailable"),
    },
    fair: t("historyFairPrice"),
    loadOlder: t("historyLoadOlder"),
    loadingOlder: t("historyLoadingOlder"),
    noOlder: t("historyNoOlder"),
  };
};

export function ResultsView({
  data,
  locale,
}: {
  data: HistorySurfaceDto;
  locale: Locale;
}) {
  const t = copy(locale);
  const period = data.period === "DEMO_SAMPLE" ? t.periodDemo : t.periodAll;
  /*
   * Appended locally rather than re-fetched wholesale: History only ever
   * grows from the front (new decisions insert above old ones), so a page
   * already shown never needs re-validating -- only the next, older one.
   */
  const [decisions, setDecisions] = useState<readonly DecisionHistoryItem[]>(
    data.decisions,
  );
  const [cursor, setCursor] = useState(data.nextCursor);
  const [hasMore, setHasMore] = useState(data.hasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);

  async function loadOlder() {
    if (!cursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const response = await fetch(
        `/api/v1/history?cursor=${encodeURIComponent(cursor)}`,
        { cache: "no-store", headers: { accept: "application/json" } },
      );
      if (!response.ok) return;
      const page = (await response.json()) as HistorySurfaceDto;
      setDecisions((existing) => [...existing, ...page.decisions]);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } finally {
      setLoadingOlder(false);
    }
  }

  const settled = decisions.filter((item) => item.settlement !== "UNSETTLED");
  const wins = settled.filter((item) => item.settlement === "WIN").length;
  const losses = settled.filter((item) => item.settlement === "LOSS").length;
  const clvPositive = settled.filter(
    (item) => item.priceQuality === "POSITIVE_CLV",
  ).length;
  /*
   * How OFTEN a decision beat the close (clvPositive/settled.length, already
   * shown) says nothing about BY HOW MUCH -- winning big and losing small
   * reads identically to the reverse under the ratio alone. `trackRecord`
   * (packages/analytics) already computes this average; it previously had
   * no caller anywhere in the codebase. Computed over whatever is loaded so
   * far, the same scope every other stat on this page already uses.
   */
  const { averageClv } = trackRecord(
    decisions.map((item) => ({
      settlement: item.settlement,
      odds: item.oddsAtDecision,
      clv: item.clv,
    })),
  );
  return (
    <div className="page">
      <div className="page__head">
        <div className="page__head-copy">
          <p className="eyebrow">{period}</p>
          <h1>{t.title}</h1>
          <p>{t.sub}</p>
        </div>
        <div className="page__badges">
          <Badge
            tone={
              data.syntheticLabel === "Synthetic data"
                ? "synthetic"
                : "positive"
            }
            dot
          >
            {data.syntheticLabel === "Synthetic data" ? t.demo : t.live}
          </Badge>
        </div>
      </div>
      <div className="stat-row">
        <Card className="stat--boxed">
          <Stat label={t.settled} value={String(settled.length)} />
        </Card>
        <Card className="stat--boxed">
          <Stat label={t.wins} value={String(wins)} tone="positive" />
        </Card>
        <Card className="stat--boxed">
          <Stat label={t.losses} value={String(losses)} tone="negative" />
        </Card>
        <Card className="stat--boxed">
          <Stat label={t.clv} value={`${clvPositive}/${settled.length}`} />
        </Card>
        <Card className="stat--boxed">
          <Stat
            label={t.avgClv}
            value={formatPercent(
              averageClv === null ? null : String(averageClv),
              1,
              locale,
            )}
            tone={
              averageClv === null
                ? undefined
                : averageClv > 0
                  ? "positive"
                  : "negative"
            }
          />
        </Card>
      </div>
      <Card>
        <CardHead
          title={t.all}
          hint={`${t.modelVersion(data.modelVersion)} · ${period}`}
        />{" "}
        {/*
         * Announced politely so a screen-reader user learns older decisions
         * loaded without the page stealing focus from wherever they were --
         * the button click already told them something would happen, this
         * only confirms it did.
         */}
        <div className="results-list" aria-live="polite">
          {decisions.map((item) => (
            <article className="results-row" key={item.id}>
              <div>
                <p className="eyebrow">
                  {new Date(item.decidedAt).toLocaleDateString(
                    intlLocale(locale),
                  )}{" "}
                  · {competitionLabel(item.competition)}
                </p>
                <h3>
                  {item.homeTeam} — {item.awayTeam}
                </h3>
                <p>
                  {marketLabel(item.market, locale)} ·{" "}
                  {selectionLabel(item.selection, locale)} ·{" "}
                  {recommendationLabel(item.decisionState, locale)}
                </p>
              </div>
              <div className="results-row__facts">
                <b
                  className={`results-outcome results-outcome--${item.settlement.toLowerCase()}`}
                >
                  {t.settlement[item.settlement]}
                </b>
                <span>
                  {t.outcome}: {item.finalScore}
                </span>
                <span>
                  {t.model} {formatPercent(item.modelProbability, 1, locale)} ·{" "}
                  {formatOdds(item.oddsAtDecision, locale)}
                </span>
                <span>
                  {t.fair} {formatOdds(item.fairOdds, locale)} · EV{" "}
                  {formatPercent(item.expectedValue, 1, locale)}
                </span>
                <span>
                  {t.price}: {t.priceQuality[item.priceQuality]}
                  {item.clv
                    ? ` · CLV ${formatPercent(item.clv, 1, locale)}`
                    : ""}
                </span>
              </div>
            </article>
          ))}
        </div>
        {hasMore ? (
          <button
            type="button"
            className="results-load-older"
            onClick={loadOlder}
            disabled={loadingOlder}
          >
            {loadingOlder ? t.loadingOlder : t.loadOlder}
          </button>
        ) : decisions.length > 0 ? (
          <p className="results-load-older__done">{t.noOlder}</p>
        ) : null}
      </Card>
    </div>
  );
}
