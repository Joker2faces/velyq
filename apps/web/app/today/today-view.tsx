"use client";

import Link from "next/link";
import {
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
import type { CustomerMatchDto } from "@velyq/contracts";
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
import { forecastReason } from "../customer/forecast-presentation";

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
      match.freshness === "FRESH" &&
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
  const forecastLabels =
    locale === "el"
      ? {
          title: "Προβλέψεις",
          source: "ΜΟΝΤΕΛΟ VELYQ",
          decision: "Απόφαση",
          unavailable: "Δεν υπάρχει πρόβλεψη",
          reason: "Αιτία",
          watch: "Παρακολούθηση",
          watchHint: "Προβλέψεις για παρακολούθηση, όχι ενεργές προτάσεις.",
          current: "Τρέχουσα",
          interesting: "Ενδιαφέρον από",
          distance: "Απόσταση από το όριο",
        }
      : {
          title: "Forecasts",
          source: "VELYQ MODEL",
          decision: "Decision",
          unavailable: "No forecast",
          reason: "Reason",
          watch: "Watch",
          watchHint:
            "Forecasts worth monitoring, not actionable recommendations.",
          current: "Current",
          interesting: "Interesting from",
          distance: "Distance to validity",
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

        <div className="stat-row">
          <Card className="stat--boxed">
            <Stat
              label={t("todayTracked")}
              value={formatCount(matches.length)}
            />
          </Card>
          <Card className="stat--boxed">
            <Stat
              label={t("todayActionable")}
              value={formatCount(summary.actionable)}
              tone={summary.actionable > 0 ? "positive" : undefined}
            />
          </Card>
          <Card className="stat--boxed">
            <Stat
              label={t("todayFreshMoves")}
              value={formatCount(freshMoves.length)}
            />
          </Card>
          <Card className="stat--boxed">
            <Stat
              label={t("todayQualityWarnings")}
              value={formatCount(summary.blocked)}
              tone={summary.blocked > 0 ? "negative" : undefined}
            />
          </Card>
          <Card className="stat--boxed">
            <Stat label="Forecasts" value={formatCount(summary.forecastable)} />
          </Card>
          <Card className="stat--boxed">
            <Stat label="Watch" value={formatCount(watch.length)} />
          </Card>
        </div>

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
              const target =
                match.priceValidity.minimumAcceptableOdds === null
                  ? null
                  : Number(match.priceValidity.minimumAcceptableOdds);
              const gap =
                target === null || match.currentOdds === null
                  ? null
                  : target - Number(match.currentOdds);
              return (
                <div className="match-row" key={`watch-${match.eventId}`}>
                  <div>
                    <strong>
                      {match.homeTeam} — {match.awayTeam}
                    </strong>
                    <p className="match-row__meta">
                      Model {formatProbability(match.modelProbability, locale)}{" "}
                      · {selectionLabel(match.selection, locale)}
                    </p>
                  </div>
                  <div className="match-row__metrics">
                    <span>
                      {forecastLabels.current}{" "}
                      {formatOdds(match.currentOdds, locale)}
                    </span>
                    {target !== null ? (
                      <span>
                        {forecastLabels.interesting} {target.toFixed(2)}+
                      </span>
                    ) : null}
                    {gap !== null && gap > 0 ? (
                      <span>
                        {forecastLabels.distance} {gap.toFixed(2)}
                      </span>
                    ) : null}
                    <span>
                      {forecastLabels.reason}:{" "}
                      {match.quality.reasonCodes
                        .map((code) => forecastReason(code, locale))
                        .join(", ")}
                    </span>
                  </div>
                </div>
              );
            })}
          </Card>
        ) : null}

        <Card>
          <CardHead
            title={forecastLabels.title}
            hint="Forecasts remain useful even when no price is actionable."
          />
          <div className="forecast-list">
            {matches.map((match) => {
              const probability =
                match.modelProbability === null
                  ? null
                  : Number(match.modelProbability);
              const other =
                probability === null
                  ? null
                  : ((1 - probability) / 2).toFixed(3);
              return (
                <article
                  className="forecast-card"
                  key={`forecast-${match.eventId}`}
                >
                  <div className="forecast-card__head">
                    <div>
                      <p className="eyebrow">
                        {match.competition} ·{" "}
                        {formatTime(match.startsAt, locale)}
                      </p>
                      <h3>
                        {match.homeTeam} — {match.awayTeam}
                      </h3>
                    </div>
                    <Badge
                      tone={probability === null ? "neutral" : "heuristic"}
                    >
                      {probability === null
                        ? forecastLabels.unavailable
                        : forecastLabels.source}
                    </Badge>
                  </div>
                  {probability === null ? (
                    <p>
                      {forecastLabels.reason}:{" "}
                      {match.quality.reasonCodes
                        .map((code) => forecastReason(code, locale))
                        .join(", ")}
                    </p>
                  ) : (
                    <>
                      <div className="forecast-card__probabilities">
                        <span>
                          Home{" "}
                          <b>
                            {formatProbability(
                              (match.selection === "Home"
                                ? probability
                                : Number(other)
                              ).toString() as never,
                              locale,
                            )}
                          </b>
                        </span>
                        <span>
                          Draw{" "}
                          <b>
                            {formatProbability(
                              (match.selection === "Draw"
                                ? probability
                                : Number(other)
                              ).toString() as never,
                              locale,
                            )}
                          </b>
                        </span>
                        <span>
                          Away{" "}
                          <b>
                            {formatProbability(
                              (match.selection === "Away"
                                ? probability
                                : Number(other)
                              ).toString() as never,
                              locale,
                            )}
                          </b>
                        </span>
                      </div>
                      <p>
                        <b>{forecastLabels.decision}:</b>{" "}
                        {recommendationLabel(match.recommendation, locale)} ·{" "}
                        {forecastLabels.reason}:{" "}
                        {match.quality.reasonCodes
                          .map((code) => forecastReason(code, locale))
                          .join(", ")}
                      </p>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </Card>

        <div className="split">
          <Card>
            <CardHead
              title={t("todayTopEdge")}
              aside={<ArrowLink href="/edge">{t("todayViewEdge")}</ArrowLink>}
            />
            {actionable.length === 0 ? (
              <EmptyState title={t("todayNoEdge")} body={t("recNoBetBody")} />
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
            <ol className="kickoffs">
              {kickoffs.map((match) => (
                <li key={match.eventId}>
                  <Link className="kickoff" href={`/matches/${match.eventId}`}>
                    <time className="kickoff__time">
                      {formatTime(match.startsAt, locale)}
                    </time>
                    <span className="kickoff__teams">
                      {match.homeTeam}
                      <em className="row__vs">{t("matchVersus")}</em>
                      {match.awayTeam}
                    </span>
                    <Badge tone={recommendationTone(match.recommendation)}>
                      {recommendationLabel(match.recommendation, locale)}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ol>
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
