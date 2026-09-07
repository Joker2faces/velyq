"use client";

import Link from "next/link";
import {
  directionOf,
  formatOdds,
  formatPercent,
  formatTime,
  freshnessLabel,
  freshnessTone,
  selectionLabel,
  translator,
  type Locale,
} from "@velyq/ui";
import type { CustomerMatchDto } from "@velyq/contracts";
import {
  Badge,
  Card,
  CardHead,
  EmptyState,
  Explain,
  PreviewDataBadge,
  Sparkline,
  Stat,
} from "../components/ui";
import type { TodaySurfaceDto } from "../customer/today-surface";

/**
 * The RADAR surface, rendered in the browser from the protected API.
 *
 * Presentation is unchanged from the server-rendered version — including the
 * movement arithmetic, which is scaled exactly once by the shared formatter.
 * Which rows this customer may see is the API's decision, not this
 * component's.
 */
export function RadarView({
  locale,
  data,
}: {
  locale: Locale;
  data: TodaySurfaceDto;
}) {
  const t = translator(locale);
  const matches = data.matches;
  const observed = matches
    .filter((match) => match.openingOdds !== null && match.currentOdds !== null)
    .sort(
      (a, b) =>
        Math.abs(numeric(b.movementPercent)) -
        Math.abs(numeric(a.movementPercent)),
    );
  const unobserved = matches.filter(
    (match) => match.openingOdds === null || match.currentOdds === null,
  );

  return (
    <div className="page">
      <div className="page__head">
        <div className="page__head-copy">
          <p className="eyebrow">{t("radarKicker")}</p>
          <h1>{t("radarTitle")}</h1>
          <p>{t("radarBody")}</p>
        </div>
        <div className="page__badges">
          <PreviewDataBadge
            provenance={data.syntheticLabel}
            label={t("previewData")}
          />
          {/* Kept: it is a claim about what RADAR does and does not observe,
              which is decision-relevant, not a note about the build. */}
          <Badge tone="neutral" emphasis="supporting">
            {t("observableOnly")}
          </Badge>
        </div>
      </div>

      <div className="stack">
        <div className="split">
          <Explain title={t("explainRadarTitle")}>
            {t("explainRadarBody")}
          </Explain>
          <Explain title={t("explainFreshnessTitle")}>
            {t("explainFreshnessBody")}
          </Explain>
        </div>

        <Card>
          <CardHead
            title={t("radarMarketMovement")}
            hint={t("radarFreshnessAware")}
          />
          {observed.length === 0 ? (
            <EmptyState title={t("radarEmpty")} body={t("radarNoHistory")} />
          ) : (
            observed.map((match) => (
              <RadarRow key={match.eventId} match={match} locale={locale} />
            ))
          )}
        </Card>

        {unobserved.length > 0 ? (
          <Card>
            <CardHead title={t("noEvidence")} hint={t("radarNoHistory")} />
            {unobserved.map((match) => (
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
                  <Badge tone="muted">{t("noEvidence")}</Badge>
                </div>
                <span className="row__sub">{t("radarNoHistory")}</span>
              </Link>
            ))}
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function RadarRow({
  match,
  locale,
}: {
  match: CustomerMatchDto;
  locale: Locale;
}) {
  const t = translator(locale);
  const direction = directionOf(match.movementPercent);
  /*
   * Say what the movement *means*, not just its size. Odds that shorten mean
   * the market moved toward the selection; odds that drift mean it moved away.
   * Nothing here claims to know why — that would be a money-flow claim.
   */
  const meaning =
    direction === "up"
      ? t("radarDrifted")
      : direction === "down"
        ? t("radarShortened")
        : t("radarUnchanged");

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
            {selectionLabel(match.selection, locale)} ·{" "}
            {formatTime(match.startsAt, locale)}
          </div>
        </div>
        <Badge tone={freshnessTone(match.freshness)} dot>
          {freshnessLabel(match.freshness, locale)}
        </Badge>
      </div>

      <div className="row__stats">
        <Stat
          label={t("radarOpening")}
          value={formatOdds(match.openingOdds, locale)}
        />
        <Stat
          label={t("radarCurrent")}
          value={formatOdds(match.currentOdds, locale)}
        />
        {/* Movement takes the market hue in both directions. A price that
            shortened is not "good"; the arrow, the sign and the sentence in
            the row foot say which way it went. */}
        <Stat
          label={t("radarMovement")}
          value={formatPercent(match.movementPercent, 1, locale)}
          tone="market"
        />
        <div className="stat">
          <span className="stat__label">{t("radarHistory")}</span>
          <Sparkline
            points={[Number(match.openingOdds), Number(match.currentOdds)]}
            tone="market"
            label={`${t("radarOpening")} ${formatOdds(match.openingOdds, locale)} → ${t(
              "radarCurrent",
            )} ${formatOdds(match.currentOdds, locale)}`}
          />
        </div>
      </div>

      {/*
       * The foot used to restate the whole row — both prices and the
       * percentage a second time, immediately under the labelled stats that
       * had just given them. What the stats cannot say is what the move
       * *means*, so that sentence is all that is left here.
       */}
      <div className="row__foot">
        <span className="row__sub">{meaning}</span>
        <span className="row__sub">{t("openMatchIntelligence")} →</span>
      </div>
    </Link>
  );
}

function numeric(value: string | null) {
  if (value === null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
