"use client";

import Link from "next/link";
import {
  reasonLabel,
  formatCount,
  formatLongDate,
  formatOdds,
  formatPercent,
  formatPointsDelta,
  formatProbability,
  formatTime,
  freshnessLabel,
  freshnessTone,
  isGatedRecommendation,
  lineupLabel,
  qualityTone,
  reasonLabels,
  recommendationExplanation,
  recommendationLabel,
  recommendationTone,
  classifyCustomerMatch,
  selectionLabel,
  summariseCustomerMatches,
  translator,
  type Locale,
} from "@velyq/ui";
import type { CustomerMatchDto, CustomerTodayAggregateDto } from "@velyq/contracts";
import { compareDecimalStrings, subtractDecimalStrings, type DecimalString } from "@velyq/decimal";
import { MatchCard } from "../components/match";
import {
  ArrowLink,
  Badge,
  Card,
  CardHead,
  EmptyState,
  Stat,
  Trend,
} from "../components/ui";
import type { TodaySurfaceDto } from "../customer/today-surface";

/**
 * The Today command centre, rendered in the browser from the protected API.
 *
 * The snapshot time and every kickoff come from that API on each visit, so
 * Today stays rolling — nothing here is fixed at build time.
 */
export function TodayView({
  locale,
  data,
}: {
  locale: Locale;
  data: TodaySurfaceDto;
}) {
  const t = translator(locale);
  const today = data;
  const matches = today.matches;

  if (matches.length === 0) {
    return (
      <div className="page">
        <Card>
          <EmptyState
            as="h1"
            title={t("dataUnavailable")}
            body={t("dataUnavailableBody")}
          />
        </Card>
      </div>
    );
  }

  /*
   * Triage, not array order. The previous page featured `matches[0]` and
   * `matches[1]` regardless of what they were, so 5 of 7 matches were
   * invisible on the page whose entire job is deciding what to look at.
   */
  const actionable = matches
    .filter((match) => match.recommendation === "STRONG_EDGE")
    .sort(compareByEdgeDescending);
  const waiting = matches.filter(
    (match) =>
      match.recommendation === "WAIT" ||
      match.recommendation === "WAIT_FOR_LINEUP",
  );
  /* A forecast is useful even when its present price is not actionable. */
  const forecastable = matches.filter(
    (match) => match.modelProbability !== null,
  );
  const watch = forecastable.filter(
    (match) =>
      match.recommendation === "WAIT" ||
      match.recommendation === "WAIT_FOR_LINEUP" ||
      match.recommendation === "EDGE_DISAPPEARED",
  );
  const blocked = matches.filter(
    (match) => classifyCustomerMatch(match) === "BLOCKED",
  );
  /*
   * The headline figures come from one partition rather than from four
   * independent filters, so "tracked" always equals the buckets that
   * describe it. Previously a match could satisfy both "watch" and
   * "blocked" and be counted twice.
   */
  const summary = summariseCustomerMatches(matches);
  const freshMoves = matches.filter(
    (match) =>
      match.freshness === "CURRENT" &&
      match.openingOdds !== null &&
      match.currentOdds !== null,
  );
  const lead = actionable[0];
  /* The one list on this page ordered by time rather than signal strength:
     a matchday card, so the reader can see what is still to come. */
  const kickoffs = [...matches]
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 6);
  const movements = matches
    .filter((match) => match.movementPercent !== null)
    .sort(compareByMovementDescending)
    .slice(0, 4);
  /* Sourced from the shared catalog rather than a local `locale === "el"`
     object: the catalog's `Record<MessageKey, string>` for Greek turns a
     missing translation into a compile error. */
  const forecastLabels = {
    watch: t("forecastsWatch"),
    watchHint: t("forecastsWatchHint"),
    reason: t("forecastsReason"),
    current: t("forecastsCurrent"),
    interesting: t("forecastsInteresting"),
    distance: t("forecastsDistance"),
  };

  return (
    <div className="page">
      <div className="page__head">
        <div className="page__head-copy">
          <p className="eyebrow">
            {formatLongDate(today.asOf, locale)} · {t("todayKicker")}
          </p>
          <h1>{t("todayTitle")}</h1>
          <p>{t("todaySnapshot", { time: formatTime(today.asOf, locale) })}</p>
        </div>
        <div className="page__badges">
          <Badge
            tone={
              today.syntheticLabel === "Synthetic data"
                ? "synthetic"
                : today.syntheticLabel === "Market data unavailable"
                  ? "neutral"
                  : "positive"
            }
            dot
          >
            {today.syntheticLabel === "Synthetic data"
              ? t("syntheticData")
              : today.syntheticLabel === "Market data unavailable"
                ? t("marketDataUnavailable")
                : t("liveData")}
          </Badge>
          <Badge tone="heuristic">{t("developmentHeuristic")}</Badge>
        </div>
      </div>

      <div className="stack">
        {/* The page asks a question in its h1; this answers it. */}
        <div className="lead">
          {lead ? (
            <>
              <div className="lead__verdict">
                <Badge tone={recommendationTone(lead.recommendation)} dot>
                  {recommendationLabel(lead.recommendation, locale)}
                </Badge>
                <Badge tone={qualityTone(lead.quality.grade)}>
                  {t("matchGrade")} {lead.quality.grade}
                </Badge>
              </div>
              <p className="lead__headline">
                {t("todayLeadStrong", {
                  match: `${lead.homeTeam} — ${lead.awayTeam}`,
                  selection: selectionLabel(lead.selection, locale),
                  odds: formatOdds(lead.currentOdds, locale),
                  model: formatProbability(lead.modelProbability, locale),
                  implied: formatProbability(lead.impliedProbability, locale),
                })}
              </p>
              <div className="lead__figure">
                <b>{formatPointsDelta(lead.probabilityEdge, locale)}</b>
                <span className="lead__meta">
                  {t("matchProbabilityEdge")} · {t("matchExpectedValue")}{" "}
                  {formatPercent(lead.expectedValue, 1, locale)}
                </span>
              </div>
              <p className="lead__meta">
                {t("todayLeadSummary", {
                  waiting: waiting.length,
                  blocked: blocked.length,
                })}
              </p>
              <ArrowLink href={`/matches/${lead.eventId}`}>
                {t("openMatchIntelligence")}
              </ArrowLink>
            </>
          ) : (
            <>
              <p className="lead__headline">{t("todayLeadNone")}</p>
              <p className="lead__meta">
                {t("todayLeadSummary", {
                  waiting: waiting.length,
                  blocked: blocked.length,
                })}
              </p>
              <ArrowLink href="/edge">{t("todayViewEdge")}</ArrowLink>
            </>
          )}
        </div>

        {/*
         * A compact summary strip rather than six boxed cards.
         *
         * These six figures used to be the first thing on Today, as six
         * outlined rectangles the width of the page -- which made the
         * primary visual of a football product a row of KPI tiles, and
         * pushed the actual fixtures below the fold. They are context, not
         * the product, so they now read as one line of counts. Two of them
         * were also hardcoded English ("Forecasts", "Watch") on a page that
         * has to work in Greek.
         */}
        <dl className="today-summary">
          <div className="today-summary__item">
            <dt>{t("todayTracked")}</dt>
            <dd>{formatCount(matches.length)}</dd>
          </div>
          <div
            className={`today-summary__item${
              summary.actionable > 0 ? " today-summary__item--positive" : ""
            }`}
          >
            <dt>{t("todayActionable")}</dt>
            <dd>{formatCount(summary.actionable)}</dd>
          </div>
          <div className="today-summary__item">
            <dt>{t("todayForecasts")}</dt>
            <dd>{formatCount(summary.forecastable)}</dd>
          </div>
          <div className="today-summary__item">
            <dt>{t("todayWatchCount")}</dt>
            <dd>{formatCount(watch.length)}</dd>
          </div>
          <div className="today-summary__item">
            <dt>{t("todayFreshMoves")}</dt>
            <dd>{formatCount(freshMoves.length)}</dd>
          </div>
          <div
            className={`today-summary__item${
              summary.blocked > 0 ? " today-summary__item--negative" : ""
            }`}
          >
            <dt>{t("todayQualityWarnings")}</dt>
            <dd>{formatCount(summary.blocked)}</dd>
          </div>
        </dl>

        {watch.length > 0 ? (
          <Card>
            <CardHead
              title={forecastLabels.watch}
              hint={forecastLabels.watchHint}
            />
            {watch.slice(0, 3).map((match) => {
              /*
               * The watch threshold is read from the authoritative
               * price-validity assessment, not derived here. This view used
               * to compute `Number(match.fairOdds) * 1.03` -- a 3% margin the
               * product never agreed, in floating point, on a value the
               * decision engine had not endorsed. The policy and its version
               * now live in one module and travel on the DTO.
               */
              const target = match.priceValidity.minimumAcceptableOdds;
              const gapResult =
                target === null || match.currentOdds === null
                  ? null
                  : subtractDecimalStrings(
                      target as DecimalString,
                      match.currentOdds as DecimalString,
                    );
              const gap = gapResult?.ok ? gapResult.value : null;
              const gapPositive = (() => {
                if (gap === null) return false;
                const comparison = compareDecimalStrings(
                  gap,
                  "0" as DecimalString,
                );
                return comparison.ok && comparison.value > 0;
              })();
              return (
                <div className="match-row" key={`watch-${match.eventId}`}>
                  <div>
                    <strong>
                      {match.homeTeam} — {match.awayTeam}
                    </strong>
                    <p className="match-row__meta">
                      {t("matchModelShort")}{" "}
                      {formatProbability(match.modelProbability, locale)} ·{" "}
                      {selectionLabel(match.selection, locale)}
                    </p>
                  </div>
                  <div className="match-row__metrics">
                    <span>
                      {forecastLabels.current}{" "}
                      {formatOdds(match.currentOdds, locale)}
                    </span>
                    {target !== null ? (
                      <span>
                        {forecastLabels.interesting} {formatOdds(target, locale)}+
                      </span>
                    ) : null}
                    {gap !== null && gapPositive ? (
                      <span>
                        {forecastLabels.distance} {formatOdds(gap, locale)}
                      </span>
                    ) : null}
                    <span>
                      {forecastLabels.reason}:{" "}
                      {match.quality.reasonCodes
                        .map((code) => reasonLabel(code, locale))
                        .join(", ")}
                    </span>
                  </div>
                </div>
              );
            })}
          </Card>
        ) : null}

        {/*
         * The Forecasts panel lived here and has been folded into the fixture
         * cards below. It repeated the same seven matches with the same
         * competition, kick-off, teams, selection, decision and reason that a
         * card already carries; its one unique value was the model
         * probability, which now sits on the card beside the price -- which is
         * the comparison the product exists to make.
         */}

        <div className="split">
          <Card>
            <CardHead
              title={t("todayTopEdge")}
              aside={<ArrowLink href="/edge">{t("todayViewEdge")}</ArrowLink>}
            />
            {actionable.length === 0 ? (
              <EmptyState
                title={t("todayNoEdge")}
                body={todayNoEdgeBody(data.summary, t)}
              />
            ) : (
              actionable.map((match) => (
                <MatchRow key={match.eventId} match={match} locale={locale} />
              ))
            )}
          </Card>

          <Card>
            <CardHead
              title={t("todayMovements")}
              aside={<ArrowLink href="/radar">{t("todayViewRadar")}</ArrowLink>}
            />
            {movements.length === 0 ? (
              <EmptyState
                title={t("todayNoMovement")}
                body={t("radarNoHistory")}
              />
            ) : (
              movements.map((match) => (
                <Link
                  className="row"
                  href={`/matches/${match.eventId}`}
                  key={match.eventId}
                >
                  <div className="row__head">
                    <span className="row__teams">
                      {match.homeTeam} <em>·</em>{" "}
                      {selectionLabel(match.selection, locale)}
                    </span>
                    <Badge tone={freshnessTone(match.freshness)}>
                      {freshnessLabel(match.freshness, locale)}
                    </Badge>
                  </div>
                  <div className="journey">
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
                    />
                  </div>
                </Link>
              ))
            )}
          </Card>
        </div>

        <Card>
          <CardHead title={t("todayKickoffs")} />
          {kickoffs.length === 0 ? (
            <EmptyState
              title={t("todayKickoffsEmpty")}
              body={t("dataUnavailableBody")}
            />
          ) : (
            /*
             * Today's fixtures as match cards rather than a list of rows.
             *
             * This was a time, two team names and a badge on one line --
             * legible, but it read as a schedule table and gave a customer
             * no reason to open anything. The card carries the competition,
             * the crests, the verdict, the current price with its freshness
             * and the one reason a decision is being held, which is enough
             * to decide whether to look closer without being the twenty
             * metrics that belong on the match page.
             */
            <div className="match-grid match-grid--wide">
              {kickoffs.map((match) => (
                <MatchCard key={match.eventId} match={match} locale={locale} />
              ))}
            </div>
          )}
        </Card>

        <div className="split">
          <Card>
            <CardHead title={t("todayLineupWatch")} />
            {waiting.length === 0 ? (
              <EmptyState
                title={t("todayLineupWatchEmpty")}
                body={t("matchAllChecksPassed")}
              />
            ) : (
              waiting.map((match) => (
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
                  <span className="row__sub">
                    {t("matchLineup")}: {lineupLabel(match.lineup, locale)} ·{" "}
                    {formatTime(match.startsAt, locale)}
                  </span>
                </Link>
              ))
            )}
          </Card>

          <Card>
            <CardHead title={t("todayQualityPanel")} />
            {blocked.length === 0 ? (
              <EmptyState
                title={t("todayQualityEmpty")}
                body={t("explainQualityBody")}
              />
            ) : (
              blocked.map((match) => (
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
                    <Badge tone={qualityTone(match.quality.grade)}>
                      {t("matchGrade")} {match.quality.grade}
                    </Badge>
                  </div>
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
              ))
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

/** A compact opportunity row used by the Today EDGE panel. */
function MatchRow({
  match,
  locale,
}: {
  match: CustomerMatchDto;
  locale: Parameters<typeof translator>[0];
}) {
  const t = translator(locale);
  return (
    <Link className="row" href={`/matches/${match.eventId}`}>
      <div className="row__head">
        <span className="row__teams">
          {match.homeTeam} <em>{t("matchVersus")}</em> {match.awayTeam}
        </span>
        <Badge tone={recommendationTone(match.recommendation)}>
          {recommendationLabel(match.recommendation, locale)}
        </Badge>
      </div>
      <span className="row__sub">
        {t("todayFullTime1x2")} · {selectionLabel(match.selection, locale)} ·{" "}
        {formatTime(match.startsAt, locale)}
      </span>
      <div className="row__stats">
        <Stat
          label={t("matchCurrentOdds")}
          value={formatOdds(match.currentOdds, locale)}
        />
        <Stat
          label={t("matchProbabilityEdge")}
          value={formatPointsDelta(match.probabilityEdge, locale)}
          tone="positive"
        />
        <Stat
          label={t("matchExpectedValue")}
          value={formatPercent(match.expectedValue, 1, locale)}
        />
      </div>
      {isGatedRecommendation(match.recommendation) ? (
        <p className="row__reason">
          {recommendationExplanation(match.recommendation, locale)}
        </p>
      ) : null}
    </Link>
  );
}

/* Sort comparators operate on plain numbers parsed from the canonical decimal
   strings. Ordering is presentation; no domain value is mutated. */
function compareByEdgeDescending(a: CustomerMatchDto, b: CustomerMatchDto) {
  return numeric(b.probabilityEdge) - numeric(a.probabilityEdge);
}

function compareByMovementDescending(a: CustomerMatchDto, b: CustomerMatchDto) {
  return (
    Math.abs(numeric(b.movementPercent)) - Math.abs(numeric(a.movementPercent))
  );
}

function numeric(value: string | null) {
  if (value === null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * "No match clears the threshold" backed by real counts, so it reads as a
 * fact about today rather than a stock sentence indistinguishable from a
 * day with zero fixtures at all. `summary` is computed over the WHOLE day
 * server-side (`summariseTodayAggregate`), before any preview slicing, so
 * the sentence stays true even on an account that only sees a few `matches`.
 */
function todayNoEdgeBody(
  summary: CustomerTodayAggregateDto,
  t: ReturnType<typeof translator>,
): string {
  if (summary.totalFixtures === 0) return t("recNoBetBody");
  const priced = summary.totalFixtures - summary.byRecommendation.INSUFFICIENT_DATA;
  const counts = t("todayNoEdgeCounts", {
    total: String(summary.totalFixtures),
    priced: String(priced),
    clearedEdge: String(summary.byRecommendation.STRONG_EDGE),
  });
  const lineupNote =
    summary.lineupGated > 0
      ? ` ${t("todayNoEdgeLineupGated", { count: String(summary.lineupGated) })}`
      : "";
  return `${t("recNoBetBody")} ${counts}${lineupNote}`;
}
