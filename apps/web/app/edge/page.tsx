import Link from "next/link";
import {
  formatCount,
  formatOdds,
  formatPercent,
  formatPointsDelta,
  formatProbability,
  isGatedRecommendation,
  qualityTone,
  reasonLabels,
  recommendationExplanation,
  recommendationLabel,
  recommendationTone,
  selectionLabel,
  translator,
  type Locale,
} from "@velyq/ui";
import type { CustomerMatchDto } from "@velyq/contracts";
import { loadCustomerToday } from "../customer-runtime";
import { getLocale } from "../locale";
import { CustomerShell } from "../customer-shell";
import {
  Badge,
  Card,
  CardHead,
  EdgeAxis,
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
              {t("syntheticData")}
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
                      <span className="fixture__team">{match.homeTeam}</span>
                      <span className="fixture__divider" aria-hidden="true" />
                      <span className="fixture__team">{match.awayTeam}</span>
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
            <span className="fixture__team">{match.homeTeam}</span>
            <span className="fixture__divider" aria-hidden="true" />
            <span className="fixture__team">{match.awayTeam}</span>
          </span>
          <div className="row__sub">
            {t("todayFullTime1x2")} · {selectionLabel(match.selection, locale)}
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
          value={formatPointsDelta(match.probabilityEdge, locale)}
          tone={numeric(match.probabilityEdge) > 0 ? "positive" : "negative"}
        />
        <Stat
          label={t("edgeColumnEv")}
          value={formatPercent(match.expectedValue, 1, locale)}
          tone={numeric(match.expectedValue) > 0 ? "positive" : "negative"}
          hint={t("explainEvBody")}
        />
      </div>

      {/* The one picture the page exists to make: model and market on a
          single probability axis, with the gap between them shaded. */}
      <EdgeAxis
        modelProbability={match.modelProbability}
        impliedProbability={match.impliedProbability}
        modelDisplay={formatProbability(match.modelProbability, locale)}
        impliedDisplay={formatProbability(match.impliedProbability, locale)}
        modelLabel={t("edgeColumnModelProbability")}
        marketLabel={t("edgeColumnImpliedProbability")}
        caption={t("edgeAxisCaption", {
          model: formatProbability(match.modelProbability, locale),
          market: formatProbability(match.impliedProbability, locale),
          edge: formatPointsDelta(match.probabilityEdge, locale),
        })}
      />

      <div className="row__foot">
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
