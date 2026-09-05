import {
  formatOdds,
  formatPercent,
  formatPointsDelta,
  formatProbability,
  formatTime,
  freshnessLabel,
  freshnessTone,
  recommendationLabel,
  recommendationTone,
  selectionLabel,
  translator,
} from "@velyq/ui";
import { getLocale } from "./locale";
import { customerToday } from "./customer-data";
import { planCatalog } from "./plan-config";
import { PublicShell } from "./components/site-chrome";
import {
  ArrowLink,
  Badge,
  Card,
  EdgeAxis,
  Sparkline,
  Trend,
} from "./components/ui";
import { IconAlert, IconCheck } from "./components/icons";
import { Fixture, PitchBackdrop } from "./components/pitch";

export default async function Home() {
  const locale = await getLocale();
  const t = translator(locale);

  /*
   * Everything shown on this page comes from the shipped synthetic fixture,
   * never from invented marketing data: the hero preview and the live strip
   * render the same DTO fields the product renders. Team names are the
   * fixture's own fictional clubs, so the public page can never imply
   * coverage of a real fixture.
   */
  const featured =
    customerToday.matches.find(
      (match) => match.recommendation === "STRONG_EDGE",
    ) ?? customerToday.matches[0];
  const liveStrip = customerToday.matches
    .filter((match) => match.currentOdds !== null)
    .slice(0, 3);

  return (
    <PublicShell locale={locale}>
      {/* ------------------------------------------------------------ hero */}
      <section className="hero">
        <div className="hero__aurora" aria-hidden="true" />
        <PitchBackdrop />
        <div className="hero__inner">
          <div className="hero__copy">
            <p className="eyebrow">{t("homeHeroEyebrow")}</p>
            <h1 className="hero__title">
              {t("homeHeroTitleLead")}
              <span>{t("homeHeroTitleAccent")}</span>
            </h1>
            <p className="hero__body">{t("homeHeroBody")}</p>
            <div className="hero__actions">
              <a className="button button--primary" href="/sign-up">
                {t("homeHeroPrimaryCta")}
              </a>
              <a className="button button--secondary" href="/sign-in">
                {t("homeHeroSecondaryCta")}
              </a>
              <a className="button button--ghost" href="/pricing">
                {t("homeHeroPricingCta")}
              </a>
            </div>
            <ul className="hero__trust">
              <li>
                <IconCheck /> {t("homeTrustEvidence")}
              </li>
              <li>
                <IconCheck /> {t("homeTrustNoClaims")}
              </li>
              <li>
                <IconCheck /> {t("homeTrustBilingual")}
              </li>
            </ul>
          </div>

          {featured ? (
            <div className="preview pitch-corner">
              <div className="preview__bar">
                <span className="eyebrow">{t("homePreviewLabel")}</span>
                <Badge tone="synthetic" dot>
                  {t("syntheticData")}
                </Badge>
              </div>

              <div className="preview__cards">
                <div className="preview__card preview__card--wide">
                  <Fixture
                    homeTeam={featured.homeTeam}
                    awayTeam={featured.awayTeam}
                    meta={`${featured.competition} · ${formatTime(
                      featured.startsAt,
                      locale,
                    )} · ${selectionLabel(featured.selection, locale)}`}
                  />
                  <p style={{ textAlign: "center" }}>
                    <Badge
                      tone={recommendationTone(featured.recommendation)}
                      dot
                    >
                      {recommendationLabel(featured.recommendation, locale)}
                    </Badge>
                  </p>
                  <EdgeAxis
                    modelProbability={featured.modelProbability}
                    impliedProbability={featured.impliedProbability}
                    modelDisplay={formatProbability(
                      featured.modelProbability,
                      locale,
                    )}
                    impliedDisplay={formatProbability(
                      featured.impliedProbability,
                      locale,
                    )}
                    modelLabel={t("homePreviewModel")}
                    marketLabel={t("homePreviewMarket")}
                    caption={t("edgeAxisCaption", {
                      model: formatProbability(
                        featured.modelProbability,
                        locale,
                      ),
                      market: formatProbability(
                        featured.impliedProbability,
                        locale,
                      ),
                      edge: formatPointsDelta(featured.probabilityEdge, locale),
                    })}
                  />
                </div>

                <div className="preview__card">
                  <span className="stat__label">{t("homePreviewEdge")}</span>
                  <span className="preview__edge preview__pulse">
                    {formatPointsDelta(featured.probabilityEdge, locale)}
                  </span>
                  <span className="card__hint">
                    {t("matchExpectedValue")}{" "}
                    {formatPercent(featured.expectedValue, 1, locale)}
                  </span>
                </div>

                <div className="preview__card sweep">
                  <span className="stat__label">{t("homePreviewRadar")}</span>
                  {featured.openingOdds && featured.currentOdds ? (
                    <>
                      <Sparkline
                        points={[
                          Number(featured.openingOdds),
                          Number(featured.currentOdds),
                        ]}
                        label={`${t("homePreviewOpening")} ${formatOdds(
                          featured.openingOdds,
                          locale,
                        )} → ${t("homePreviewCurrent")} ${formatOdds(
                          featured.currentOdds,
                          locale,
                        )}`}
                      />
                      <div className="journey">
                        <span className="journey__price journey__price--from">
                          {formatOdds(featured.openingOdds, locale)}
                        </span>
                        <span className="journey__arrow" aria-hidden="true">
                          →
                        </span>
                        <span className="journey__price">
                          {formatOdds(featured.currentOdds, locale)}
                        </span>
                      </div>
                      <Trend
                        value={featured.movementPercent}
                        display={formatPercent(
                          featured.movementPercent,
                          1,
                          locale,
                        )}
                      />
                    </>
                  ) : (
                    <span className="card__hint">{t("radarNoHistory")}</span>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* ------------------------------------- live synthetic intelligence */}
      <section className="section touchline reveal" id="live">
        <div className="section__head">
          <p className="eyebrow">{t("homeLiveEyebrow")}</p>
          <h2>{t("homeLiveTitle")}</h2>
          <p>{t("homeLiveBody")}</p>
        </div>
        <div className="grid-cards">
          {liveStrip.map((match) => (
            <Card key={match.eventId} interactive>
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginBottom: "var(--space-3)",
                }}
              >
                <Badge tone={freshnessTone(match.freshness)} dot>
                  {freshnessLabel(match.freshness, locale)}
                </Badge>
              </div>
              <Fixture
                size="sm"
                homeTeam={match.homeTeam}
                awayTeam={match.awayTeam}
                meta={`${t("todayFullTime1x2")} · ${selectionLabel(
                  match.selection,
                  locale,
                )} · ${formatTime(match.startsAt, locale)}`}
              />
              <div
                className="row__stats"
                style={{ marginTop: "var(--space-4)" }}
              >
                <div className="stat">
                  <span className="stat__label">{t("radarOpening")}</span>
                  <span className="stat__value">
                    {formatOdds(match.openingOdds, locale)}
                  </span>
                </div>
                <div className="stat">
                  <span className="stat__label">{t("radarCurrent")}</span>
                  <span className="stat__value">
                    {formatOdds(match.currentOdds, locale)}
                  </span>
                </div>
                <div className="stat">
                  <span className="stat__label">{t("radarMovement")}</span>
                  <span className="stat__value">
                    <Trend
                      value={match.movementPercent}
                      display={formatPercent(match.movementPercent, 1, locale)}
                    />
                  </span>
                </div>
              </div>
              <p style={{ marginTop: "var(--space-4)" }}>
                <Badge tone={recommendationTone(match.recommendation)}>
                  {recommendationLabel(match.recommendation, locale)}
                </Badge>
              </p>
            </Card>
          ))}
        </div>
        <p className="fine-print" style={{ marginTop: "var(--space-5)" }}>
          {t("homeLiveDisclaimer")}
        </p>
      </section>

      {/* ------------------------------------------- EDGE / RADAR / MATCH */}
      <section className="section touchline reveal" id="modules">
        <div className="section__head">
          <p className="eyebrow">{t("homeModulesEyebrow")}</p>
          <h2>{t("homeModulesTitle")}</h2>
        </div>
        <div className="modules">
          {(
            [
              {
                id: "edge",
                label: "homeEdgeLabel",
                title: "homeEdgeTitle",
                body: "homeEdgeBody",
                points: ["homeEdgePoint1", "homeEdgePoint2", "homeEdgePoint3"],
              },
              {
                id: "radar",
                label: "homeRadarLabel",
                title: "homeRadarTitle",
                body: "homeRadarBody",
                points: [
                  "homeRadarPoint1",
                  "homeRadarPoint2",
                  "homeRadarPoint3",
                ],
              },
              {
                id: "match-intelligence",
                label: "homeMatchLabel",
                title: "homeMatchTitle",
                body: "homeMatchBody",
                points: [
                  "homeMatchPoint1",
                  "homeMatchPoint2",
                  "homeMatchPoint3",
                ],
              },
            ] as const
          ).map((module) => (
            <article className="module" id={module.id} key={module.id}>
              <div className="module__body">
                <p className="module__label">{t(module.label)}</p>
                <h3>{t(module.title)}</h3>
                <ArrowLink href="/sign-up">{t("homeCreateAccount")}</ArrowLink>
              </div>
              <div className="module__body">
                <p>{t(module.body)}</p>
                <ul className="module__points">
                  {module.points.map((point) => (
                    <li key={point}>
                      <IconCheck />
                      {t(point)}
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------ how it works */}
      <section className="section touchline reveal">
        <div className="section__head">
          <p className="eyebrow">{t("homeHowEyebrow")}</p>
          <h2>{t("homeHowTitle")}</h2>
        </div>
        <ol className="steps">
          {(
            [
              ["homeHowOneTitle", "homeHowOneBody"],
              ["homeHowTwoTitle", "homeHowTwoBody"],
              ["homeHowThreeTitle", "homeHowThreeBody"],
              ["homeHowFourTitle", "homeHowFourBody"],
            ] as const
          ).map(([title, body], index) => (
            <li className="step" key={title}>
              <span className="step__index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3>{t(title)}</h3>
              <p>{t(body)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ------------------------------- why probability alone is not enough */}
      <section className="section touchline reveal">
        <div className="section__head">
          <p className="eyebrow">{t("homeProbabilityEyebrow")}</p>
          <h2>{t("homeProbabilityTitle")}</h2>
          <p>{t("homeProbabilityBody")}</p>
        </div>
        <div className="grid-cards">
          {(
            [
              ["homeProbabilityOneTitle", "homeProbabilityOneBody"],
              ["homeProbabilityTwoTitle", "homeProbabilityTwoBody"],
              ["homeProbabilityThreeTitle", "homeProbabilityThreeBody"],
            ] as const
          ).map(([title, body], index) => (
            <Card key={title} interactive>
              <p className="step__index">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3 style={{ marginTop: "var(--space-3)" }}>{t(title)}</h3>
              <p>{t(body)}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------- football workflow */}
      <section className="section touchline reveal">
        <div className="section__head">
          <p className="eyebrow">{t("homeWorkflowEyebrow")}</p>
          <h2>{t("homeWorkflowTitle")}</h2>
        </div>
        <ol className="steps">
          {(
            [
              ["homeWorkflowOneTitle", "homeWorkflowOneBody"],
              ["homeWorkflowTwoTitle", "homeWorkflowTwoBody"],
              ["homeWorkflowThreeTitle", "homeWorkflowThreeBody"],
              ["homeWorkflowFourTitle", "homeWorkflowFourBody"],
            ] as const
          ).map(([title, body]) => (
            <li className="step" key={title}>
              <h3>{t(title)}</h3>
              <p>{t(body)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* -------------------------------------------------------- why velyq */}
      <section className="section touchline reveal">
        <div className="section__head">
          <p className="eyebrow">{t("homeWhyEyebrow")}</p>
          <h2>{t("homeWhyTitle")}</h2>
        </div>
        <div className="grid-cards">
          {(
            [
              ["homeWhyOneTitle", "homeWhyOneBody"],
              ["homeWhyTwoTitle", "homeWhyTwoBody"],
              ["homeWhyThreeTitle", "homeWhyThreeBody"],
              ["homeWhyFourTitle", "homeWhyFourBody"],
            ] as const
          ).map(([title, body]) => (
            <Card key={title} interactive>
              <h3>{t(title)}</h3>
              <p>{t(body)}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------- pricing preview */}
      <section className="section touchline reveal" id="pricing-preview">
        <div className="section__head">
          <p className="eyebrow">{t("homePricingEyebrow")}</p>
          <h2>{t("homePricingTitle")}</h2>
          <p>{t("homePricingBody")}</p>
        </div>
        <div className="plans">
          {planCatalog(locale).map((plan) => (
            <Card
              key={plan.code}
              className={`plan${plan.featured ? " plan--featured pitch-corner" : ""}`}
              interactive
            >
              {plan.featured ? (
                <span className="plan__ribbon">
                  <Badge tone="positive">{t("pricingMostPopular")}</Badge>
                </span>
              ) : null}
              <div>
                <h3 className="plan__name">{plan.name}</h3>
                <p className="plan__for">{plan.audience}</p>
              </div>
              <p className="plan__pitch">{plan.pitch}</p>
              <div className="plan__price">
                <span className="plan__amount">{plan.price}</span>
                <span className="plan__period">{plan.pricePeriod}</span>
              </div>
              <ul className="plan__features">
                {plan.features.slice(0, 3).map((feature) => (
                  <li key={feature}>
                    <IconCheck />
                    {feature}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
        <p style={{ marginTop: "var(--space-5)" }}>
          <ArrowLink href="/pricing">{t("homePricingCta")}</ArrowLink>
        </p>
      </section>

      {/* ---------------------------- responsible use / data transparency */}
      <section className="section reveal">
        <div className="notice">
          <h2>
            <IconAlert size={20} />
            {t("homeNoticeTitle")}
          </h2>
          <p>{t("homeNoticeBody")}</p>
          <p>
            <ArrowLink href="/responsible-use">{t("homeNoticeLink")}</ArrowLink>
          </p>
        </div>
      </section>

      {/* --------------------------------------------------------- final CTA */}
      <section className="section reveal">
        <div className="final-cta pitch-corner">
          <div style={{ display: "grid", gap: "var(--space-3)" }}>
            <p className="eyebrow">{t("homeFinalEyebrow")}</p>
            <h2>{t("homeFinalTitle")}</h2>
            <p>{t("homeFinalBody")}</p>
          </div>
          <a className="button button--primary" href="/sign-up">
            {t("homeFinalCta")}
          </a>
        </div>
      </section>
    </PublicShell>
  );
}
