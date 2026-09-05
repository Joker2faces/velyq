import {
  directionOf,
  formatDateTime,
  formatOdds,
  formatPercent,
  formatPercentagePoints,
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
  translator,
} from "@velyq/ui";
import { loadCustomerMatch } from "../../customer-runtime";
import { getLocale } from "../../locale";
import { CustomerShell } from "../../customer-shell";
import {
  ArrowLink,
  Badge,
  Bar,
  Card,
  CardHead,
  Compare,
  DefinitionList,
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
    return (
      <CustomerShell>
        <div className="page">
          <ErrorState
            title={notFound ? t("matchNotFound") : t("customerUnavailable")}
            body={
              notFound ? t("matchNotFoundBody") : t("customerUnavailableBody")
            }
            action={<ArrowLink href="/today">{t("backToToday")}</ArrowLink>}
          />
        </div>
      </CustomerShell>
    );
  }

  const match = result.value;
  const direction = directionOf(match.movementPercent);
  const hasEstimate = match.probabilityEdge !== null;
  const hasPriceHistory =
    match.openingOdds !== null && match.currentOdds !== null;
  const movementMeaning =
    direction === "up"
      ? t("radarDrifted")
      : direction === "down"
        ? t("radarShortened")
        : t("radarUnchanged");

  return (
    <CustomerShell>
      <div className="page">
        <div className="page__head">
          <div className="page__head-copy">
            <p className="eyebrow">{t("matchKicker")}</p>
            <h1 className="match-title">
              <span>{match.homeTeam}</span>
              <em>{t("matchVersus")}</em>
              <span>{match.awayTeam}</span>
            </h1>
            <p>
              {match.competition} · {formatDateTime(match.startsAt, locale)} UTC
            </p>
          </div>
          <div className="page__badges">
            <Badge tone="synthetic" dot>
              {match.syntheticLabel}
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
                  {match.selection}
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
                value={formatPercent(match.probabilityEdge, 1, locale)}
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
                  <Compare
                    rows={[
                      {
                        name: t("matchModelProbability"),
                        value: match.modelProbability,
                        display: formatProbability(
                          match.modelProbability,
                          locale,
                        ),
                      },
                      {
                        name: t("matchImpliedProbability"),
                        value: match.impliedProbability,
                        display: formatProbability(
                          match.impliedProbability,
                          locale,
                        ),
                        tone: "lilac",
                      },
                    ]}
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
                    <Stat label={t("matchSelection")} value={match.selection} />
                  </div>
                </>
              ) : (
                <p className="row__reason">{t("matchNoEstimate")}</p>
              )}
            </Card>

            <Card>
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
                    tone={direction === "up" ? "amber" : "mint"}
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
                      display={formatPercentagePoints(
                        match.movementPercent,
                        locale,
                      )}
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
                      ? "mint"
                      : match.quality.grade === "F"
                        ? "rose"
                        : "amber"
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
                      <Badge key={reason} tone="amber">
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
