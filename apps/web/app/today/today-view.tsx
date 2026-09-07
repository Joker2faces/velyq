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
  selectionLabel,
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
  PreviewDataBadge,
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
  const blocked = matches.filter(
    (match) =>
      match.quality.grade === "F" ||
      match.recommendation === "INSUFFICIENT_DATA",
  );
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
          <PreviewDataBadge
            provenance={today.syntheticLabel}
            label={t("previewData")}
          />
        </div>
      </div>

      <div className="stack">
        {/* The page asks a question in its h1; this answers it. */}
        <div className="lead">
          {lead ? (
            <>
              {/* The verdict leads; the grade supports it. Drawn at equal
                  weight — and both green whenever the news was good — the
                  reader had to work out which pill was VELYQ's answer. */}
              <div className="lead__verdict">
                <Badge
                  tone={recommendationTone(lead.recommendation)}
                  emphasis="lead"
                  dot
                >
                  {recommendationLabel(lead.recommendation, locale)}
                </Badge>
                <Badge
                  tone={qualityTone(lead.quality.grade)}
                  emphasis="supporting"
                >
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
              value={formatCount(actionable.length)}
              tone={actionable.length > 0 ? "positive" : undefined}
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
              value={formatCount(blocked.length)}
              tone={blocked.length > 0 ? "negative" : undefined}
            />
          </Card>
        </div>

        <CoverageNote coverage={today.coverage} locale={locale} />

        <SuppressionSummary summary={today.suppressed} locale={locale} />

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
/**
 * The events the intelligence universe excludes, summarised.
 *
 * A single line with a count and its reasons, rather than a row per event.
 * The alternative was what this page used to do to itself: dozens of
 * identical "insufficient data" cards for competitions the model has never
 * been fitted on, which crowd out the handful of matches it actually has an
 * opinion about. Nothing is deleted or hidden from operations — every one of
 * these events is still in the database and still inspectable in admin.
 *
 * Renders nothing at all when there is nothing to report, so a clean day
 * stays clean instead of carrying an empty explanation.
 */
/**
 * What this page is actually showing, against the whole window.
 *
 * Stated rather than left to inference. The counts behind it are database
 * aggregates over the entire requested window, not a tally of the rows that
 * happened to load, so "eight of two hundred and sixty-seven" is a fact about
 * the day rather than about the page size — and when the page genuinely is
 * truncated, it says so instead of looking like a quiet afternoon.
 */
function CoverageNote({
  coverage,
  locale,
}: {
  coverage:
    | Readonly<{
        eventsInWindow: number;
        eligible: number;
        returned: number;
        pageSize: number;
        truncated: boolean;
      }>
    | undefined;
  locale: Locale;
}) {
  const t = translator(locale);
  if (!coverage || coverage.eventsInWindow === 0) return null;
  return (
    <p className="suppressed__note">
      {t("todayCoverage", {
        eligible: formatCount(coverage.eligible),
        total: formatCount(coverage.eventsInWindow),
      })}
      {coverage.truncated
        ? ` ${t("todayCoverageTruncated", {
            returned: formatCount(coverage.returned),
            eligible: formatCount(coverage.eligible),
          })}`
        : ""}
    </p>
  );
}

function SuppressionSummary({
  summary,
  locale,
}: {
  summary:
    | Readonly<{ total: number; byReason: Readonly<Record<string, number>> }>
    | undefined;
  locale: Locale;
}) {
  const t = translator(locale);
  if (!summary || summary.total === 0) return null;
  const label = (reason: string) => {
    if (reason === "COMPETITION_NOT_IN_POLICY")
      return t("suppressedCompetitionNotInPolicy");
    if (reason === "COMPETITION_EXPERIMENTAL")
      return t("suppressedCompetitionExperimental");
    if (reason === "COMPETITION_ADMIN_ONLY")
      return t("suppressedCompetitionAdminOnly");
    if (reason === "COMPETITION_EXCLUDED")
      return t("suppressedCompetitionExcluded");
    return reason;
  };
  const reasons = Object.entries(summary.byReason).sort(
    ([, left], [, right]) => right - left,
  );
  return (
    <Card>
      <CardHead
        title={`${formatCount(summary.total)} ${t("todaySuppressedTitle")}`}
      />
      <p className="suppressed__note">{t("todaySuppressedBody")}</p>
      <ul className="checklist">
        {reasons.map(([reason, count]) => (
          <li key={reason}>
            <Badge tone="neutral">{formatCount(count)}</Badge> {label(reason)}
          </li>
        ))}
      </ul>
    </Card>
  );
}

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
