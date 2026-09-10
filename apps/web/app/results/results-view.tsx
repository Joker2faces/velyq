"use client";
import { useState } from "react";
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
    outcome: t("historyOutcome"),
    price: t("historyPriceQuality"),
    demo: t("historySyntheticSample"),
    live: t("historyLiveData"),
    all: t("historyAllQualifying"),
    model: t("historyModel"),
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

  const settled = decisions.filter(
    (item) => item.settlement !== "UNSETTLED",
  );
  const wins = settled.filter((item) => item.settlement === "WIN").length;
  const losses = settled.filter((item) => item.settlement === "LOSS").length;
  const clvPositive = settled.filter(
    (item) => item.priceQuality === "POSITIVE_CLV",
  ).length;
  const settlementLabel = (value: string) =>
    ({
      en: { WIN: "Win", LOSS: "Loss", VOID: "Void", UNSETTLED: "Unsettled" },
      el: { WIN: "Νίκη", LOSS: "Ήττα", VOID: "Άκυρο", UNSETTLED: "Εκκρεμεί" },
    })[locale][value as "WIN"] ?? value;
  const priceLabel = (value: string) =>
    ({
      en: {
        POSITIVE_CLV: "Good closing-line price",
        NEGATIVE_CLV: "Below closing-line price",
        UNAVAILABLE: "Unavailable",
      },
      el: {
        POSITIVE_CLV: "Καλή τιμή έναντι κλεισίματος",
        NEGATIVE_CLV: "Χαμηλότερη τιμή από το κλείσιμο",
        UNAVAILABLE: "Μη διαθέσιμη",
      },
    })[locale][value as "POSITIVE_CLV"] ?? value;
  return (
    <div className="page">
      <div className="page__head">
        <div className="page__head-copy">
          <p className="eyebrow">{data.period}</p>
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
      </div>
      <Card>
        <CardHead
          title={t.all}
          hint={`${data.modelVersion} · ${data.period}`}
        />{" "}
        <div className="results-list">
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
                  {settlementLabel(item.settlement)}
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
                  {t.price}: {priceLabel(item.priceQuality)}
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
