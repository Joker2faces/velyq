import { formatOdds, formatPercent, type Locale } from "@velyq/ui";
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
  return (
    <div className="page">
      <div className="page__head">
        <div className="page__head-copy">
          <p className="eyebrow">{data.period}</p>
          <h1>{t.title}</h1>
          <p>{t.sub}</p>
        </div>
        <div className="page__badges">
          <Badge tone="synthetic" dot>
            {t.demo}
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
          title="All qualifying decisions"
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
                  · {item.competition}
                </p>
                <h3>
                  {item.homeTeam} — {item.awayTeam}
                </h3>
                <p>
                  {item.market} · {item.selection} · {item.decisionState}
                </p>
              </div>
              <div className="results-row__facts">
                <b
                  className={`results-outcome results-outcome--${item.settlement.toLowerCase()}`}
                >
                  {item.settlement}
                </b>
                <span>
                  {t.outcome}: {item.finalScore}
                </span>
                <span>
                  Model{" "}
                  {formatPercent(item.modelProbability as never, 1, locale)} ·{" "}
                  {formatOdds(item.oddsAtDecision as never, locale)}
                </span>
                <span>
                  Fair {formatOdds(item.fairOdds as never, locale)} · EV{" "}
                  {formatPercent(item.expectedValue as never, 1, locale)}
                </span>
                <span>
                  {t.price}: {item.priceQuality.replace("_", " ")}
                  {item.clv
                    ? ` · CLV ${formatPercent(item.clv as never, 1, locale)}`
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
