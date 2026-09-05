import Link from "next/link";
import {
  formatCount,
  formatOdds,
  formatPercent,
  formatProbability,
  isGatedRecommendation,
  qualityTone,
  reasonLabels,
  recommendationExplanation,
  recommendationLabel,
  recommendationTone,
  translator,
  type Locale,
} from "@velyq/ui";
import type { CustomerMatchDto } from "@velyq/contracts";
import { loadCustomerToday } from "../customer-runtime";
import { getLocale } from "../locale";
import { CustomerShell } from "../customer-shell";
import {
  Badge,
  Bar,
  Card,
  CardHead,
  Compare,
  EmptyState,
  ErrorState,
  Explain,
  Stat,
} from "../components/ui";

export default async function Edge() {
  const locale = await getLocale();
  const t = translator(locale);
  const result = await loadCustomerToday();

  if (!result.ok) {
    return (
      <CustomerShell active="/edge">
        <div className="page">
          <ErrorState
            title={t("customerUnavailable")}
            body={t("customerUnavailableBody")}
          />
        </div>
      </CustomerShell>
    );
  }

  const matches = result.value.matches;
  /* Priced rows first, ordered by the strength of the edge; rows the model
     declined to estimate are grouped separately with their reason, rather
     than interleaved with actionable ones. */
  const priced = matches
    .filter((match) => match.probabilityEdge !== null)
    .sort((a, b) => numeric(b.probabilityEdge) - numeric(a.probabilityEdge));
  const gated = matches.filter((match) => match.probabilityEdge === null);

  return (
    <CustomerShell active="/edge">
      <div className="page">
        <div className="page__head">
          <div className="page__head-copy">
            <p className="eyebrow">{t("edgeKicker")}</p>
            <h1>{t("edgeTitle")}</h1>
            <p>{t("edgeBody")}</p>
          </div>
          <div className="page__badges">
            <Badge tone="synthetic" dot>
              {result.value.syntheticLabel}
            </Badge>
            <Badge tone="heuristic">{t("developmentHeuristic")}</Badge>
          </div>
        </div>

        <div className="stack">
          <div className="split">
            <Explain title={t("explainEdgeTitle")}>
              {t("explainEdgeBody")}
            </Explain>
            <Explain title={t("explainEvTitle")}>{t("explainEvBody")}</Explain>
          </div>

          <Card>
            <CardHead
              title={t("edgeCurrentOpportunities")}
              hint={t("edgeSortNote")}
              aside={
                <span className="card__hint">
                  {t("edgeTracked", { count: formatCount(matches.length) })}
                </span>
              }
            />
            {priced.length === 0 ? (
              <EmptyState title={t("edgeEmpty")} body={t("todayNoEdge")} />
            ) : (
              priced.map((match) => (
                <EdgeRow key={match.eventId} match={match} locale={locale} />
              ))
            )}
          </Card>

          {gated.length > 0 ? (
            <Card>
              <CardHead title={t("edgeGated")} hint={t("edgeGatedNote")} />
              {gated.map((match) => (
                <Link
                  className="row"
                  href={`/matches/${match.eventId}`}
                  key={match.eventId}
                >
                  <div className="row__head">
                    <span className="row__teams">
                      {match.homeTeam} <em>{t("matchVersus")}</em>{" "}
                      {match.awayTeam}
                    </span>
                    <Badge tone={recommendationTone(match.recommendation)}>
                      {recommendationLabel(match.recommendation, locale)}
                    </Badge>
                  </div>
                  <p className="row__reason">
                    {recommendationExplanation(match.recommendation, locale)}
                  </p>
                  <div className="reasons">
                    {reasonLabels(match.quality.reasonCodes, locale).map(
                      (reason) => (
                        <Badge key={reason} tone="muted">
                          {reason}
                        </Badge>
                      ),
                    )}
                  </div>
                </Link>
              ))}
            </Card>
          ) : null}
        </div>
      </div>
    </CustomerShell>
  );
}

function EdgeRow({
  match,
  locale,
}: {
  match: CustomerMatchDto;
  locale: Locale;
}) {
  const t = translator(locale);
  return (
    <Link className="row" href={`/matches/${match.eventId}`}>
      <div className="row__head">
        <div>
          <span className="row__teams">
            {match.homeTeam} <em>{t("matchVersus")}</em> {match.awayTeam}
          </span>
          <div className="row__sub">
            {t("todayFullTime1x2")} · {match.selection}
          </div>
        </div>
        <div className="page__badges">
          <Badge tone={qualityTone(match.quality.grade)}>
            {t("matchGrade")} {match.quality.grade}
          </Badge>
          <Badge tone={recommendationTone(match.recommendation)}>
            {recommendationLabel(match.recommendation, locale)}
          </Badge>
        </div>
      </div>

      <div className="row__stats">
        <Stat
          label={t("edgeColumnOdds")}
          value={formatOdds(match.currentOdds, locale)}
        />
        <Stat
          label={t("edgeColumnFairOdds")}
          value={formatOdds(match.fairOdds, locale)}
          hint={t("explainFairOddsBody")}
        />
        <Stat
          label={t("edgeColumnEdge")}
          value={formatPercent(match.probabilityEdge, 1, locale)}
          tone={numeric(match.probabilityEdge) > 0 ? "positive" : "negative"}
        />
        <Stat
          label={t("edgeColumnEv")}
          value={formatPercent(match.expectedValue, 1, locale)}
          tone={numeric(match.expectedValue) > 0 ? "positive" : "negative"}
          hint={t("explainEvBody")}
        />
      </div>

      {/* Model against market on one shared axis: the comparison that the
          whole page exists to make. */}
      <Compare
        rows={[
          {
            name: t("edgeColumnModelProbability"),
            value: match.modelProbability,
            display: formatProbability(match.modelProbability, locale),
          },
          {
            name: t("edgeColumnImpliedProbability"),
            value: match.impliedProbability,
            display: formatProbability(match.impliedProbability, locale),
            tone: "lilac",
          },
        ]}
      />

      <div className="row__foot">
        <div style={{ flex: "1 1 12rem", minWidth: 0 }}>
          <Bar
            value={match.expectedValue}
            magnitude={0.2}
            tone={numeric(match.expectedValue) >= 0 ? "mint" : "rose"}
            label={`${t("edgeColumnEv")}: ${formatPercent(match.expectedValue, 1, locale)}`}
          />
        </div>
        <span className="row__sub">{t("openMatchIntelligence")} →</span>
      </div>

      {isGatedRecommendation(match.recommendation) ? (
        <p className="row__reason">
          {recommendationExplanation(match.recommendation, locale)}
        </p>
      ) : null}
    </Link>
  );
}

function numeric(value: string | null) {
  if (value === null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
