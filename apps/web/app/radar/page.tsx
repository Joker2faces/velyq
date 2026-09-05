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
import { loadCustomerToday } from "../customer-runtime";
import { getLocale } from "../locale";
import { CustomerShell } from "../customer-shell";
import {
  Badge,
  Card,
  CardHead,
  EmptyState,
  ErrorState,
  Explain,
  Sparkline,
  Stat,
  Trend,
} from "../components/ui";

export default async function Radar() {
  const locale = await getLocale();
  const t = translator(locale);
  const result = await loadCustomerToday();

  if (!result.ok) {
    return (
      <CustomerShell active="/radar">
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
    <CustomerShell active="/radar">
      <div className="page">
        <div className="page__head">
          <div className="page__head-copy">
            <p className="eyebrow">{t("radarKicker")}</p>
            <h1>{t("radarTitle")}</h1>
            <p>{t("radarBody")}</p>
          </div>
          <div className="page__badges">
            <Badge tone="synthetic" dot>
              {t("syntheticData")}
            </Badge>
            <Badge tone="heuristic">{t("observableOnly")}</Badge>
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
    </CustomerShell>
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
        <Stat
          label={t("radarMovement")}
          value={formatPercent(match.movementPercent, 1, locale)}
          tone={direction === "down" ? "positive" : undefined}
        />
        <div className="stat">
          <span className="stat__label">{t("radarHistory")}</span>
          <Sparkline
            points={[Number(match.openingOdds), Number(match.currentOdds)]}
            tone={direction === "up" ? "caution" : "pitch"}
            label={`${t("radarOpening")} ${formatOdds(match.openingOdds, locale)} → ${t(
              "radarCurrent",
            )} ${formatOdds(match.currentOdds, locale)}`}
          />
        </div>
      </div>

      <div className="row__foot">
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
            caption={meaning}
          />
          <span className="row__sub">{meaning}</span>
        </div>
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
