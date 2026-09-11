import {
  formatOdds,
  formatPercent,
  formatPointsDelta,
  formatProbability,
  formatTime,
  freshnessLabel,
  freshnessTone,
  qualityTone,
  selectionLabel,
  translator,
  type Locale,
} from "@velyq/ui";
import { CompetitionMark, TeamCrest } from "../components/match";
import { ArrowLink, Badge } from "../components/ui";
import type { VelyqOneSelection } from "./velyq-one";

export function VelyqOneCard({
  selection,
  locale,
  full,
  waiting,
  blocked,
}: {
  selection: VelyqOneSelection | null;
  locale: Locale;
  full: boolean;
  waiting: number;
  blocked: number;
}) {
  const t = translator(locale);

  if (selection === null) {
    return (
      <section
        className="velyq-one velyq-one--empty"
        aria-labelledby="velyq-one-title"
      >
        <header className="velyq-one__masthead">
          <p className="velyq-one__brand">VELYQ ONE</p>
          <Badge tone="neutral">{t("velyqOneNoSelectionBadge")}</Badge>
        </header>
        <div className="velyq-one__empty-copy">
          <h2 id="velyq-one-title">{t("velyqOneEmptyTitle")}</h2>
          <p>{t("velyqOneEmptyBody")}</p>
          <p className="velyq-one__context">
            {t("todayLeadSummary", { waiting, blocked })}
          </p>
        </div>
        <ArrowLink href="/edge">{t("velyqOneExploreEdge")}</ArrowLink>
      </section>
    );
  }

  const { match, metrics } = selection;
  return (
    <section className="velyq-one" aria-labelledby="velyq-one-title">
      <header className="velyq-one__masthead">
        <div>
          <p className="velyq-one__brand">VELYQ ONE</p>
          <h2 id="velyq-one-title">
            {t(full ? "velyqOneTitleFull" : "velyqOneTitlePreview")}
          </h2>
        </div>
        <Badge tone="positive" dot>
          {t("velyqOneCurrentSelection")}
        </Badge>
      </header>

      <div className="velyq-one__body">
        <div className="velyq-one__fixture">
          <div className="velyq-one__fixture-meta">
            <CompetitionMark competition={match.competition} />
            <time dateTime={match.startsAt}>
              {formatTime(match.startsAt, locale)}
            </time>
          </div>
          <div className="velyq-one__teams">
            <span className="velyq-one__team">
              <TeamCrest team={match.homeTeam} size="lg" />
              <strong>{match.homeTeam}</strong>
            </span>
            <span className="velyq-one__versus">{t("matchVersus")}</span>
            <span className="velyq-one__team velyq-one__team--away">
              <TeamCrest team={match.awayTeam} size="lg" />
              <strong>{match.awayTeam}</strong>
            </span>
          </div>
          <p className="velyq-one__supporting">{t("velyqOneSupporting")}</p>
        </div>

        <div className="velyq-one__signal">
          <div className="velyq-one__price">
            <span>{t("todayFullTime1x2")}</span>
            <strong>{selectionLabel(match.selection, locale)}</strong>
            <b>{formatOdds(match.currentOdds, locale)}</b>
          </div>
          <dl className="velyq-one__metrics">
            <div>
              <dt>{t("matchModelProbability")}</dt>
              <dd>{formatProbability(match.modelProbability, locale)}</dd>
            </div>
            <div>
              <dt>{t("matchImpliedProbability")}</dt>
              <dd>{formatProbability(metrics.impliedProbability, locale)}</dd>
            </div>
            <div>
              <dt>{t("matchProbabilityEdge")}</dt>
              <dd>{formatPointsDelta(metrics.probabilityEdge, locale)}</dd>
            </div>
            <div>
              <dt>{t("matchExpectedValue")}</dt>
              <dd>{formatPercent(metrics.expectedValue, 1, locale)}</dd>
            </div>
            <div>
              <dt>{t("velyqOneMinimumOdds")}</dt>
              <dd>
                {formatOdds(match.priceValidity.minimumAcceptableOdds, locale)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <footer className="velyq-one__footer">
        <div className="velyq-one__evidence">
          <Badge tone={freshnessTone(match.freshness)}>
            {freshnessLabel(match.freshness, locale)}
          </Badge>
          <Badge tone="positive">{t("velyqOneOfficialLineup")}</Badge>
          <Badge tone={qualityTone(match.quality.grade)}>
            {t("matchGrade")} {match.quality.grade}
          </Badge>
          {match.bookmakerCount ? (
            <Badge tone="neutral">
              {t("priceValidityBestOf", {
                count: String(match.bookmakerCount),
              })}
            </Badge>
          ) : null}
        </div>
        <ArrowLink href={`/matches/${match.eventId}`}>
          {t("velyqOneCta")}
        </ArrowLink>
      </footer>
    </section>
  );
}
