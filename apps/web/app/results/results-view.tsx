import {
  competitionLabel,
  formatOdds,
  formatPercent,
  marketLabel,
  recommendationLabel,
  selectionLabel,
  type Locale,
} from "@velyq/ui";
import type { HistorySurfaceDto } from "../customer/history-surface";
import { Badge, Card, CardHead, Stat } from "../components/ui";

const copy = (locale: Locale) =>
  locale === "el"
    ? {
        title: "Ιστορικό αποφάσεων",
        sub: "Όλες οι επιλέξιμες αποφάσεις εμφανίζονται, μαζί με τις ήττες.",
        settled: "Διευθετημένες",
        wins: "Νίκες",
        losses: "Ήττες",
        clv: "Θετικό CLV",
        outcome: "Αποτέλεσμα",
        price: "Ποιότητα τιμής",
        demo: "Συνθετικό δείγμα QA",
        live: "Ζωντανά δεδομένα",
        all: "Όλες οι επιλέξιμες αποφάσεις",
        model: "Μοντέλο",
        fair: "Δίκαιη τιμή",
      }
    : {
        title: "Decision history",
        sub: "Every qualifying decision is shown, including losses.",
        settled: "Settled",
        wins: "Wins",
        losses: "Losses",
        clv: "Positive CLV",
        outcome: "Outcome",
        price: "Price quality",
        demo: "Synthetic QA sample",
        live: "Live data",
        all: "All qualifying decisions",
        model: "Model",
        fair: "Fair",
      };

export function ResultsView({
  data,
  locale,
}: {
  data: HistorySurfaceDto;
  locale: Locale;
}) {
  const t = copy(locale);
  const settled = data.decisions.filter(
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
          {data.decisions.map((item) => (
            <article className="results-row" key={item.id}>
              <div>
                <p className="eyebrow">
                  {new Date(item.decidedAt).toLocaleDateString(
                    locale === "el" ? "el-GR" : "en-GB",
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
      </Card>
    </div>
  );
}
