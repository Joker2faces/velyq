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
} from "@velyq/ui";
import type { CustomerMatchDto } from "@velyq/contracts";
import { loadCustomerToday } from "../customer-runtime";
import { getLocale } from "../locale";
import { CustomerShell } from "../customer-shell";
import {
  ArrowLink,
  Badge,
  Card,
  CardHead,
  EmptyState,
  ErrorState,
  Stat,
  Trend,
} from "../components/ui";

export default async function Today() {
  const locale = await getLocale();
  const t = translator(locale);
  const result = await loadCustomerToday();

  if (!result.ok) {
    return (
      <CustomerShell active="/today">
        <div className="page">
          <ErrorState
            title={t("customerUnavailable")}
            body={t("customerUnavailableBody")}
          />
        </div>
      </CustomerShell>
    );
  }

  const today = result.value;
  const matches = today.matches;

  if (matches.length === 0) {
    return (
      <CustomerShell active="/today">
        <div className="page">
          <Card>
            <EmptyState
              as="h1"
              title={t("dataUnavailable")}
              body={t("dataUnavailableBody")}
            />
          </Card>
        </div>
      </CustomerShell>
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
    <CustomerShell active="/today">
      <div className="page">
        <div className="page__head">
          <div className="page__head-copy">
            <p className="eyebrow">
              {formatLongDate(today.asOf, locale)} · {t("todayKicker")}
            </p>
            <h1>{t("todayTitle")}</h1>
            <p>
              {t("todaySnapshot", { time: formatTime(today.asOf, locale) })}
            </p>
          </div>
          <div className="page__badges">
            <Badge tone="synthetic" dot>
              {t("syntheticData")}
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
                aside={
                  <ArrowLink href="/radar">{t("todayViewRadar")}</ArrowLink>
                }
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
                        display={formatPercent(
                          match.movementPercent,
                          1,
                          locale,
                        )}
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
                    <Link
                      className="kickoff"
                      href={`/matches/${match.eventId}`}
                    >
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
    </CustomerShell>
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
