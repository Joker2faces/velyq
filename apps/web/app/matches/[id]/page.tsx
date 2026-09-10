import {
  competitionLabel,
  directionOf,
  movementLabel,
  formatDateTime,
  formatOdds,
  formatPercent,
  formatPointsDelta,
  formatProbability,
  freshnessLabel,
  freshnessTone,
  lineupLabel,
  lineupTone,
  qualityMeter,
  qualityTone,
  reasonLabels,
  recommendationExplanation,
  recommendationLabel,
  recommendationTone,
  selectionLabel,
  translator,
} from "@velyq/ui";
import { loadCustomerMatch, loadPostMatchAutopsy } from "../../customer-runtime";
import { getLocale } from "../../locale";
import { CustomerShell } from "../../customer-shell";
import {
  DecisionReasoning,
  EvidenceTimeline,
  MarketMap,
  PostMatchAutopsy,
  PriceValidity,
  RiskFlags,
  SecondaryMarkets,
} from "../../components/match";
import {
  ArrowLink,
  Badge,
  Bar,
  Card,
  CardHead,
  DefinitionList,
  EdgeAxis,
  ErrorState,
  Explain,
  Sparkline,
  Stat,
  Trend,
} from "../../components/ui";

/**
 * Match Intelligence.
 *
 * Ordered by what a customer needs first: the verdict and the reason for it,
 * then the comparison that drives it, then the supporting evidence, and only
 * then the audit trail — which is collapsed, because version strings are
 * auditor content, not analysis.
 */
export default async function Match({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getLocale();
  const t = translator(locale);
  const result = await loadCustomerMatch(id);

  if (!result.ok) {
    const notFound = result.code === "NOT_FOUND";
    const locked = result.code === "ENTITLEMENT_REQUIRED";
    return (
      <CustomerShell>
        <div className="page">
          <ErrorState
            title={
              locked
                ? t("matchLockedTitle")
                : notFound
                  ? t("matchNotFound")
                  : t("customerUnavailable")
            }
            body={
              locked
                ? t("matchLockedBody")
                : notFound
                  ? t("matchNotFoundBody")
                  : t("customerUnavailableBody")
            }
            action={
              <ArrowLink href={locked ? "/pricing" : "/today"}>
                {locked ? t("matchLockedAction") : t("backToToday")}
              </ArrowLink>
            }
          />
        </div>
      </CustomerShell>
    );
  }

  const match = result.value;
  const autopsy = await loadPostMatchAutopsy(id);
  const hasEstimate = match.probabilityEdge !== null;
  /*
   * Price history exists only once movement was actually establishable.
   * Opening is null unless the outcome was observed at two distinct instants,
   * so this no longer treats one instant's bookmaker spread as a history.
   */
  const hasPriceHistory =
    match.movementState !== "INSUFFICIENT_HISTORY" &&
    match.openingOdds !== null &&
    match.currentOdds !== null;
  const direction = directionOf(match.movementPercent);
  const movementMeaning = movementLabel(
    match.movementState,
    match.movementPercent,
    locale,
  );

  return (
    <CustomerShell>
      <div className="page">
        <div className="page__head">
          <div className="page__head-copy">
            <p className="eyebrow">{t("matchKicker")}</p>
            {/* Scoreboard-style fixture header: the two sides separated by
                the halfway line, as a matchday board presents them. */}
            <h1 className="fixture fixture--lg">
              <span className="fixture__teams">
                <span className="fixture__team fixture__team--home">
                  {match.homeTeam}
                </span>
                <span className="fixture__divider" aria-hidden="true" />
                <span className="fixture__team fixture__team--away">
                  {match.awayTeam}
                </span>
              </span>
            </h1>
            <p>
              {competitionLabel(match.competition)} ·{" "}
              {formatDateTime(match.startsAt, locale)} UTC
            </p>
          </div>
          <div className="page__badges">
            <Badge
              tone={
                match.syntheticLabel === "Synthetic data"
                  ? "synthetic"
                  : match.syntheticLabel === "Market data unavailable"
                    ? "neutral"
                    : "positive"
              }
              dot
            >
              {match.syntheticLabel === "Synthetic data"
                ? t("syntheticData")
                : match.syntheticLabel === "Market data unavailable"
                  ? t("marketDataUnavailable")
                  : t("liveData")}
            </Badge>
            <Badge tone={qualityTone(match.quality.grade)}>
              {t("matchGrade")} {match.quality.grade}
            </Badge>
          </div>
        </div>

        <div className="stack">
          {/* ------------------------------------------------------ verdict */}
          <div className="verdict">
            <div className="verdict__top">
              <p className="eyebrow">{t("matchVerdict")}</p>
              <div className="lead__verdict">
                <h2>{recommendationLabel(match.recommendation, locale)}</h2>
                <Badge tone={recommendationTone(match.recommendation)} dot>
                  {selectionLabel(match.selection, locale)}
                </Badge>
              </div>
              {/* The reason travels with the verdict rather than sitting a
                  hundred lines further down the page. */}
              <p className="verdict__reason">
                {recommendationExplanation(match.recommendation, locale)}
              </p>
            </div>

            <div className="verdict__figures">
              <Stat
                label={t("matchCurrentOdds")}
                value={formatOdds(match.currentOdds, locale)}
                size="lg"
              />
              <Stat
                label={t("matchProbabilityEdge")}
                value={formatPointsDelta(match.probabilityEdge, locale)}
                size="lg"
                tone={hasEstimate ? "positive" : undefined}
                hint={t("explainEdgeBody")}
              />
              <Stat
                label={t("matchExpectedValue")}
                value={formatPercent(match.expectedValue, 1, locale)}
                size="lg"
                hint={t("explainEvBody")}
              />
            </div>

            <p className="card__hint">{t("matchModelDisclaimer")}</p>
          </div>

          {/* --------------------------------------------- model vs market */}
          <div className="split">
            <Card>
              <CardHead title={t("matchMarket")} />
              {hasEstimate ? (
                <>
                  <EdgeAxis
                    modelProbability={match.modelProbability}
                    impliedProbability={match.impliedProbability}
                    modelDisplay={formatProbability(
                      match.modelProbability,
                      locale,
                    )}
                    impliedDisplay={formatProbability(
                      match.impliedProbability,
                      locale,
                    )}
                    modelLabel={t("matchModelProbability")}
                    marketLabel={t("matchImpliedProbability")}
                    caption={t("edgeAxisCaption", {
                      model: formatProbability(match.modelProbability, locale),
                      market: formatProbability(
                        match.impliedProbability,
                        locale,
                      ),
                      edge: formatPointsDelta(match.probabilityEdge, locale),
                    })}
                  />
                  <div
                    className="row__stats"
                    style={{ marginTop: "var(--space-5)" }}
                  >
                    <Stat
                      label={t("matchFairOdds")}
                      value={formatOdds(match.fairOdds, locale)}
                      hint={t("explainFairOddsBody")}
                    />
                    <Stat
                      label={t("matchCurrentOdds")}
                      value={formatOdds(match.currentOdds, locale)}
                    />
                    <Stat
                      label={t("matchSelection")}
                      value={selectionLabel(match.selection, locale)}
                    />
                  </div>
                </>
              ) : (
                <p className="row__reason">{t("matchNoEstimate")}</p>
              )}
            </Card>

            {/*
             * Price validity, directly after the market picture.
             *
             * The DTO has carried the authoritative price-validity output
             * all along -- break-even, minimum acceptable, status and the
             * policy version -- and the flagship screen showed none of it.
             * A customer could see that the model and the market disagreed
             * without being told whether the price on offer still cleared
             * the policy, which is the question that decides whether the
             * disagreement is worth anything.
             */}
            <Card>
              <CardHead
                title={t("priceValidityTitle")}
                hint={t("priceValidityLead")}
              />
              <PriceValidity match={match} locale={locale} />
            </Card>

            <Card className="sweep">
              <CardHead
                title={t("matchRadarEvidence")}
                aside={
                  <Badge tone={freshnessTone(match.freshness)}>
                    {freshnessLabel(match.freshness, locale)}
                  </Badge>
                }
              />
              {hasPriceHistory ? (
                <>
                  <Sparkline
                    points={[
                      Number(match.openingOdds),
                      Number(match.currentOdds),
                    ]}
                    tone={direction === "up" ? "caution" : "pitch"}
                    label={t("matchOpeningToCurrent", {
                      opening: formatOdds(match.openingOdds, locale),
                      current: formatOdds(match.currentOdds, locale),
                    })}
                  />
                  <div
                    className="journey"
                    style={{ marginTop: "var(--space-4)" }}
                  >
                    <span className="journey__price journey__price--from">
                      {formatOdds(match.openingOdds, locale)}
                    </span>
                    <span className="journey__arrow" aria-hidden="true">
                      →
                    </span>
                    <span className="journey__price">
                      {formatOdds(match.currentOdds, locale)}
                    </span>
                    <Trend
                      value={match.movementPercent}
                      display={formatPercent(match.movementPercent, 1, locale)}
                      caption={movementMeaning}
                    />
                  </div>
                  <p
                    className="card__hint"
                    style={{ marginTop: "var(--space-3)" }}
                  >
                    {movementMeaning}
                  </p>
                </>
              ) : (
                <p className="row__reason">{t("radarNoHistory")}</p>
              )}
              <p className="card__hint" style={{ marginTop: "var(--space-4)" }}>
                {t("matchNoMoneyFlow")}
              </p>
            </Card>
          </div>

          {/*
           * Shown first once it exists: a settled fixture's own real
           * outcome is what a customer actually wants to check first,
           * before the pre-match verdict and price cards below -- which
           * remain visible underneath as the honest record of what was
           * said before kickoff.
           */}
          {autopsy ? (
            <Card>
              <CardHead
                title={t("matchAutopsyTitle")}
                hint={t("matchAutopsyLead")}
              />
              <PostMatchAutopsy autopsy={autopsy} locale={locale} />
            </Card>
          ) : null}

          {match.marketConsensus ? (
            <Card>
              <CardHead title={t("marketMapTitle")} hint={t("marketMapLead")} />
              <MarketMap consensus={match.marketConsensus} locale={locale} />
            </Card>
          ) : null}

          {match.secondaryMarkets && match.secondaryMarkets.length > 0 ? (
            <Card>
              <CardHead
                title={t("matchOtherMarketsTitle")}
                hint={t("matchOtherMarketsLead")}
              />
              <SecondaryMarkets match={match} locale={locale} />
            </Card>
          ) : null}

          {/*
           * Why, why not, and what would overturn either.
           *
           * The reason codes were previously visible only as bare badges
           * inside the data-quality card, which buried the negative
           * intelligence that is often the most useful thing on the page --
           * and nothing stated what would change the verdict at all.
           */}
          <Card>
            <DecisionReasoning match={match} locale={locale} />
            {match.riskFlags && match.riskFlags.length > 0 ? (
              <>
                <p className="risk-flags__title">{t("riskFlagsTitle")}</p>
                <RiskFlags flags={match.riskFlags} locale={locale} />
              </>
            ) : null}
          </Card>

          {match.evidenceTimeline && match.evidenceTimeline.length > 0 ? (
            <Card>
              <CardHead
                title={t("evidenceTimelineTitle")}
                hint={t("evidenceTimelineLead")}
              />
              <EvidenceTimeline events={match.evidenceTimeline} locale={locale} />
            </Card>
          ) : null}

          {/* ----------------------------------------------- quality/lineup */}
          <div className="split">
            <Card>
              <CardHead
                title={t("matchQuality")}
                aside={
                  <Badge tone={qualityTone(match.quality.grade)}>
                    {t("matchGrade")} {match.quality.grade}
                  </Badge>
                }
              />
              <div className="meter">
                <Bar
                  value={String(qualityMeter(match.quality.grade) / 100)}
                  magnitude={1}
                  tone={
                    match.quality.grade === "A" || match.quality.grade === "B"
                      ? "pitch"
                      : match.quality.grade === "F"
                        ? "negative"
                        : "caution"
                  }
                  label={`${t("matchGrade")} ${match.quality.grade}`}
                />
                <div className="meter__scale">
                  <span>F</span>
                  <span>A</span>
                </div>
              </div>
              <div className="reasons" style={{ marginTop: "var(--space-4)" }}>
                {match.quality.reasonCodes.length > 0 ? (
                  reasonLabels(match.quality.reasonCodes, locale).map(
                    (reason) => (
                      <Badge key={reason} tone="caution">
                        {reason}
                      </Badge>
                    ),
                  )
                ) : (
                  <p className="row__reason">{t("matchAllChecksPassed")}</p>
                )}
              </div>
            </Card>

            <Card>
              <CardHead
                title={t("matchLineup")}
                aside={
                  <Badge tone={lineupTone(match.lineup)}>
                    {lineupLabel(match.lineup, locale)}
                  </Badge>
                }
              />
              <p className="row__reason">
                {match.lineup === "OFFICIAL"
                  ? t("matchLineupOfficialBody")
                  : match.lineup === "MISSING"
                    ? t("matchLineupMissingBody")
                    : t("matchLineupOtherBody", {
                        state: lineupLabel(match.lineup, locale).toLowerCase(),
                      })}
              </p>
              <p className="card__hint" style={{ marginTop: "var(--space-3)" }}>
                {t("matchLineupEvidenceNote")}
              </p>
              <div
                className="row__stats"
                style={{ marginTop: "var(--space-4)" }}
              >
                <Stat
                  label={t("matchPriceEvidence")}
                  value={
                    match.currentOdds ? t("matchAvailable") : t("matchMissing")
                  }
                />
                <Stat
                  label={t("matchDataFreshness")}
                  value={freshnessLabel(match.freshness, locale)}
                />
                <Stat
                  label={t("matchMappingQuality")}
                  value={match.quality.grade}
                />
              </div>
            </Card>
          </div>

          {/* --------------------------------------------------- glossary */}
          <div className="split">
            <Explain title={t("explainEdgeTitle")}>
              {t("explainEdgeBody")}
            </Explain>
            <Explain title={t("explainQualityTitle")}>
              {t("explainQualityBody")}
            </Explain>
          </div>

          {/* ------------------------------------------------------- trace */}
          <Explain title={t("matchTrace")}>
            <p
              className="card__hint"
              style={{ marginBottom: "var(--space-4)" }}
            >
              {t("matchTraceHint")}
            </p>
            <DefinitionList
              items={[
                {
                  term: t("matchTraceModel"),
                  value: `${match.trace.modelVersion} · ${match.trace.maturity}`,
                },
                {
                  term: t("matchTraceCalibration"),
                  value: match.trace.calibrationVersion,
                },
                { term: t("matchTraceScore"), value: match.trace.scoreVersion },
                {
                  term: t("matchTraceQualityPolicy"),
                  value: `${match.quality.policyVersion} · ${match.quality.grade}`,
                },
                {
                  term: t("matchTracePriceSnapshot"),
                  value: `${formatOdds(match.currentOdds, locale)} · ${freshnessLabel(
                    match.freshness,
                    locale,
                  )}`,
                },
                {
                  term: t("matchTraceFeatureCutoff"),
                  value: `${formatDateTime(match.trace.featureCutoff, locale)} UTC`,
                },
              ]}
            />
          </Explain>
        </div>
      </div>
    </CustomerShell>
  );
}
