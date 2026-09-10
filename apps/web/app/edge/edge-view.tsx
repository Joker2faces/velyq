"use client";

import Link from "next/link";
import {
  formatCount,
  formatOdds,
  freshnessLabel,
  freshnessTone,
  formatPercent,
  formatPointsDelta,
  formatProbability,
  isGatedRecommendation,
  marketLabel as translateMarketLabel,
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
import {
  Badge,
  Card,
  CardHead,
  EdgeAxis,
  EmptyState,
  Explain,
  Stat,
} from "../components/ui";
import { RiskFlags } from "../components/match";
import type { TodaySurfaceDto } from "../customer/today-surface";

/**
 * The EDGE surface, rendered in the browser from the protected API.
 *
 * Identical presentation to the server-rendered version it replaces — the
 * page was always a thin data load followed by pure presentation, so only
 * where the data comes from has changed. Which rows the customer may see is
 * decided by the API from their own entitlements, never here.
 */
export function EdgeView({
  locale,
  data,
}: {
  locale: Locale;
  data: TodaySurfaceDto;
}) {
  const t = translator(locale);
  const matches = data.matches;
  /*
   * Segmented by decision state, not by whether an edge could be computed.
   *
   * This page used to split on `probabilityEdge !== null`, which put every
   * evaluated market under "Current opportunities" -- so a selection the
   * engine had explicitly refused sat beside one it endorsed, and the page
   * said "evaluated" while reading as "actionable". Those are different
   * claims, and conflating them is how a decision-support product turns into
   * a tip sheet.
   *
   * EDGE_DISAPPEARED gets its own section rather than being folded into
   * waiting: an edge that was published and then withdrawn is a lifecycle
   * event a customer is owed, not an absence.
   */
  const byEdge = (a: CustomerMatchDto, b: CustomerMatchDto) =>
    numeric(b.probabilityEdge) - numeric(a.probabilityEdge);
  const actionable = matches
    .filter((match) => match.recommendation === "STRONG_EDGE")
    .sort(byEdge);
  const expired = matches
    .filter((match) => match.recommendation === "EDGE_DISAPPEARED")
    .sort(byEdge);
  const waiting = matches
    .filter(
      (match) =>
        match.recommendation === "WAIT" ||
        match.recommendation === "WAIT_FOR_LINEUP",
    )
    .sort(byEdge);
  const noEdge = matches
    .filter(
      (match) =>
        match.recommendation === "NO_BET" ||
        match.recommendation === "INSUFFICIENT_DATA",
    )
    .sort(byEdge);

  return (
    <div className="page">
      <div className="page__head">
        <div className="page__head-copy">
          <p className="eyebrow">{t("edgeKicker")}</p>
          <h1>{t("edgeTitle")}</h1>
          <p>{t("edgeBody")}</p>
        </div>
        <div className="page__badges">
          <Badge
            tone={
              data.syntheticLabel === "Synthetic data"
                ? "synthetic"
                : data.syntheticLabel === "Market data unavailable"
                  ? "neutral"
                  : "positive"
            }
            dot
          >
            {data.syntheticLabel === "Synthetic data"
              ? t("syntheticData")
              : data.syntheticLabel === "Market data unavailable"
                ? t("marketDataUnavailable")
                : t("liveData")}
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
            title={t("edgeSectionActionable")}
            hint={t("edgeSectionActionableNote")}
            aside={
              <span className="card__hint">
                {t("edgeTracked", {
                  count: formatCount(matches.length),
                  actionable: formatCount(actionable.length),
                })}
              </span>
            }
          />
          {actionable.length === 0 ? (
            <EmptyState title={t("edgeEmpty")} body={t("todayNoEdge")} />
          ) : (
            actionable.map((match) => (
              <EdgeRow key={match.eventId} match={match} locale={locale} />
            ))
          )}
        </Card>

        {expired.length > 0 ? (
          <Card>
            <CardHead
              title={t("edgeSectionExpired")}
              hint={t("edgeSectionExpiredNote")}
            />
            {expired.map((match) => (
              <EdgeRow key={match.eventId} match={match} locale={locale} />
            ))}
          </Card>
        ) : null}

        {waiting.length > 0 ? (
          <Card>
            <CardHead
              title={t("edgeSectionWaiting")}
              hint={t("edgeSectionWaitingNote")}
            />
            {waiting.map((match) => (
              <HeldRow key={match.eventId} match={match} locale={locale} />
            ))}
          </Card>
        ) : null}

        {noEdge.length > 0 ? (
          <Card>
            <CardHead
              title={t("edgeSectionNoEdge")}
              hint={t("edgeSectionNoEdgeNote")}
            />
            {noEdge.map((match) => (
              <HeldRow key={match.eventId} match={match} locale={locale} />
            ))}
          </Card>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A market that was evaluated and is not actionable.
 *
 * Deliberately lighter than `EdgeRow`: the metrics that matter for acting on
 * a price are not the point here, the reason it is being held is.
 */
function HeldRow({
  match,
  locale,
}: {
  match: CustomerMatchDto;
  locale: Locale;
}) {
  const t = translator(locale);
  const strongSecondaryMarkets = (match.secondaryMarkets ?? []).filter(
    (row) => row.recommendation === "STRONG_EDGE",
  );
  return (
    <Link className="row" href={`/matches/${match.eventId}`}>
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
        {reasonLabels(match.quality.reasonCodes, locale).map((reason) => (
          <Badge key={reason} tone="muted">
            {reason}
          </Badge>
        ))}
      </div>
      <RiskFlags flags={match.riskFlags ?? []} locale={locale} />
      {/*
       * The headline market being held back does not mean nothing on this
       * fixture is actionable -- a totals decision can clear the policy
       * independently. Fires only for a real STRONG_EDGE decision.
       */}
      {strongSecondaryMarkets.length > 0 ? (
        <p className="row__secondary">
          {t("matchAlsoEdge")}:{" "}
          {strongSecondaryMarkets
            .map(
              (row) =>
                translateMarketLabel(row.marketLabelKey, locale) +
                (row.lineValue ? ` ${row.lineValue}` : ""),
            )
            .join(", ")}
        </p>
      ) : null}
      <div className="row__foot">
        <span className="row__sub">{t("openMatchIntelligence")} →</span>
      </div>
    </Link>
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
  const strongSecondaryMarkets = (match.secondaryMarkets ?? []).filter(
    (row) => row.recommendation === "STRONG_EDGE",
  );
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
          {/* How current the price is: an edge on a stale price is not one. */}
          <Badge tone={freshnessTone(match.freshness)}>
            {freshnessLabel(match.freshness, locale)}
          </Badge>
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
        {/*
         * The lowest price still worth acting on, taken from the
         * authoritative price-validity output rather than derived here. A
         * customer comparing the current price against it can see at a
         * glance how much room is left before the opportunity stops being
         * one.
         */}
        <Stat
          label={t("edgeColumnMinimumValid")}
          value={formatOdds(match.priceValidity.minimumAcceptableOdds, locale)}
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

      {/*
       * A compact pointer to an actionable secondary market, never a claim
       * about its own movement or freshness -- those do not exist for a
       * secondary market yet. Fires only for a real STRONG_EDGE decision.
       */}
      {strongSecondaryMarkets.length > 0 ? (
        <p className="row__secondary">
          {t("matchAlsoEdge")}:{" "}
          {strongSecondaryMarkets
            .map(
              (row) =>
                translateMarketLabel(row.marketLabelKey, locale) +
                (row.lineValue ? ` ${row.lineValue}` : ""),
            )
            .join(", ")}
        </p>
      ) : null}

      <RiskFlags flags={match.riskFlags ?? []} locale={locale} />

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
