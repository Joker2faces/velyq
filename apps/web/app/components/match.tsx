import type {
  CustomerMatchDto,
  CustomerSecondaryMarketDto,
} from "@velyq/contracts";
import Link from "next/link";
import {
  formatOdds,
  formatPercent,
  formatProbability,
  formatTime,
  freshnessLabel,
  freshnessTone,
  competitionLabel,
  isGatedRecommendation,
  marketLabel,
  priceValidityLabel,
  priceValidityTone,
  recommendationLabel,
  recommendationTone,
  reasonLabel,
  reasonLabels,
  recommendationExplanation,
  selectionLabel,
  translator,
  type Locale,
} from "@velyq/ui";
import { Badge } from "./ui";

/**
 * Mirrors `PostMatchAutopsyDto`/`PostMatchAutopsyRow` in
 * `../customer-runtime.ts` (a server-only module: `next/headers`, a raw
 * database session). Redeclared here rather than imported so this
 * presentation file -- reachable from `today-view.tsx`, a client component
 * -- never has even a type-only edge into server-only code.
 */
type PostMatchAutopsyRow = Readonly<{
  marketLabelKey: string;
  lineValue: string | null;
  selection: string;
  decisionStatus: string;
  whyNotCodes: readonly string[];
  modelProbability: string | null;
  fairOdds: string | null;
  offeredOdds: string | null;
  outcome: "WIN" | "LOSS" | "VOID" | "UNSETTLED";
  closingOdds: string | null;
  clv: string | null;
}>;
type PostMatchAutopsyDto = Readonly<{
  finalScore: string;
  rows: readonly PostMatchAutopsyRow[];
}>;

/**
 * Football-first presentation primitives.
 *
 * The customer surfaces grew as tables of metrics: every fixture was a row of
 * cells, and browsing meant reading twenty numbers before knowing whether a
 * match was worth opening. These components exist to make the *fixture* the
 * unit a customer scans — competition, kick-off, two clubs, one verdict, one
 * reason — and to leave the twenty numbers to Match Intelligence, which is
 * where someone who has decided to look deeper actually goes.
 */

/** Initials for a club, from the words that carry its identity. */
function clubInitials(name: string): string {
  /*
   * Common suffixes carry no identity: "FC", "United" and "Town" are shared
   * by half a league, so a crest reading "UT" for United Town tells a
   * customer nothing. The first letters of the distinctive words do.
   */
  const skip = new Set([
    "fc",
    "afc",
    "cf",
    "sc",
    "ac",
    "united",
    "city",
    "town",
    "club",
    "de",
    "of",
    "the",
    "and",
  ]);
  const words = name
    .split(/[\s.\-—]+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0);
  const distinctive = words.filter((word) => !skip.has(word.toLowerCase()));
  const source = distinctive.length > 0 ? distinctive : words;
  const initials = source
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
  return initials.length > 0 ? initials : name.slice(0, 2).toUpperCase();
}

/**
 * A stable hue per club, derived from its name.
 *
 * Deliberately not a real crest. Club badges are copyrighted, and scraping
 * them would be both a legal problem and a broken-image problem the first
 * time a provider renamed a team. A generated mark is always available,
 * always the same colour for the same club, and looks intentional rather
 * than like a missing asset.
 */
function clubHue(name: string): number {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1)
    hash = (hash * 31 + name.charCodeAt(index)) % 360;
  return hash;
}

export function TeamCrest({
  team,
  size = "md",
}: {
  team: string;
  size?: "sm" | "md" | "lg";
}) {
  const hue = clubHue(team);
  return (
    <span
      className={`crest crest--${size}`}
      style={{
        /* Two stops of one hue: a badge, not a flat colour chip. */
        ["--crest-hue" as string]: String(hue),
      }}
      aria-hidden="true"
    >
      <span className="crest__initials">{clubInitials(team)}</span>
    </span>
  );
}

/**
 * Competition context, as a mark plus its name.
 *
 * Competition is what makes a fixture list legible — "Serie A" tells a
 * customer more about a match than any metric on the card — so it leads the
 * card rather than being a footnote.
 */
export function CompetitionMark({ competition }: { competition: string }) {
  const label = competitionLabel(competition);
  return (
    <span className="competition">
      <span className="competition__mark" aria-hidden="true" />
      <span className="competition__name">{label}</span>
    </span>
  );
}

/**
 * The one reason a card shows.
 *
 * A card carries a single reason on purpose: the full list belongs on the
 * match page, and a card that lists five is a card nobody reads. Quality
 * reason codes come first because they are what actually holds a decision
 * back; the selection is the fallback when nothing is being withheld.
 */
function headlineReason(
  match: CustomerMatchDto,
  locale: Locale,
): string | null {
  const [first] = match.quality.reasonCodes;
  if (first) return reasonLabel(first, locale);
  return null;
}

/**
 * Browsing-level match card.
 *
 * Everything here is meant to be readable at a glance and nothing here is
 * derived in the view: the verdict, the price and the reason all arrive on
 * the DTO already decided. `priceValidity.minimumAcceptableOdds` is shown
 * rather than any threshold computed here, because a view that invents a
 * margin invents a policy.
 */
export function MatchCard({
  match,
  locale,
  href,
}: {
  match: CustomerMatchDto;
  locale: Locale;
  href?: string;
}) {
  const t = translator(locale);
  const reason = headlineReason(match, locale);
  const kickoff = formatTime(match.startsAt, locale);
  const target = href ?? `/matches/${match.eventId}`;
  const strongSecondaryMarkets = (match.secondaryMarkets ?? []).filter(
    (row) => row.recommendation === "STRONG_EDGE",
  );

  const card = (
    <article className="match-card">
      <header className="match-card__head">
        <CompetitionMark competition={match.competition} />
        <time className="match-card__kickoff" dateTime={match.startsAt}>
          {kickoff}
        </time>
      </header>

      <div className="match-card__teams">
        <span className="match-card__team">
          <TeamCrest team={match.homeTeam} />
          <span className="match-card__team-name">{match.homeTeam}</span>
        </span>
        <span className="match-card__versus" aria-hidden="true" />
        <span className="match-card__team">
          <TeamCrest team={match.awayTeam} />
          <span className="match-card__team-name">{match.awayTeam}</span>
        </span>
      </div>

      <footer className="match-card__foot">
        <span className="match-card__verdict">
          <Badge tone={recommendationTone(match.recommendation)}>
            {recommendationLabel(match.recommendation, locale)}
          </Badge>
          <span className="match-card__selection">
            {selectionLabel(match.selection, locale)}
          </span>
        </span>

        {/*
         * Model beside market, which is the question the product exists to
         * answer: what does VELYQ believe, what does the market believe,
         * and do they disagree? Showing the price alone makes this a
         * fixture list; showing both makes it intelligence. A match with no
         * model probability simply omits it -- the reason line below says
         * why -- rather than printing a dash that reads like a failure.
         */}
        <span className="match-card__numbers">
          {match.modelProbability === null ? null : (
            <span className="match-card__model">
              <span className="match-card__model-label">
                {t("matchModelShort")}
              </span>
              <b>{formatProbability(match.modelProbability, locale)}</b>
            </span>
          )}
          {match.currentOdds === null ? (
            <span className="match-card__price match-card__price--absent">
              {t("reasonMarketDataUnavailable")}
            </span>
          ) : (
            <span className="match-card__price">
              <b>{formatOdds(match.currentOdds, locale)}</b>
              <Badge tone={freshnessTone(match.freshness)}>
                {freshnessLabel(match.freshness, locale)}
              </Badge>
            </span>
          )}
        </span>
      </footer>

      {reason ? <p className="match-card__reason">{reason}</p> : null}
      {/*
       * A compact pointer to an actionable secondary market, never a claim
       * about its own movement or freshness -- those figures do not exist
       * for a secondary market yet, and this line does not invent them. It
       * only ever fires for a real STRONG_EDGE decision, so a quiet fixture
       * (the normal case) shows nothing extra.
       */}
      {strongSecondaryMarkets.length > 0 ? (
        <p className="match-card__secondary">
          {t("matchAlsoEdge")}:{" "}
          {strongSecondaryMarkets
            .map(
              (row) =>
                marketLabel(row.marketLabelKey, locale) +
                (row.lineValue ? ` ${row.lineValue}` : ""),
            )
            .join(", ")}
        </p>
      ) : null}
    </article>
  );

  /*
   * The whole card is the target. A card whose only affordance is a small
   * "open" link is a card that is annoying on a phone, which is where most
   * of this will be read.
   */
  return (
    <Link href={target} className="match-card__link" prefetch={false}>
      {card}
    </Link>
  );
}

/**
 * Price validity — is the price on offer still one worth taking?
 *
 * Every number here comes from `priceValidity`, which the server computes
 * with the authoritative policy. Nothing is derived in this component: a view
 * that multiplies fair odds by a margin of its own invents a policy the
 * product never agreed, which is exactly the defect the price-validity module
 * exists to prevent.
 *
 * The scale is the point. "Break-even 7.35, minimum 7.50, current 13.50" is
 * three numbers a customer has to hold in their head; a position on a line
 * between them is a glance.
 */
export function PriceValidity({
  match,
  locale,
}: {
  match: CustomerMatchDto;
  locale: Locale;
}) {
  const t = translator(locale);
  const { status, breakEvenOdds, minimumAcceptableOdds, policyVersion } =
    match.priceValidity;

  /*
   * Unavailable is a real answer, not an error, and the two reasons for it
   * are different things a customer would act on differently: no price
   * observed yet, or no model probability to price against.
   */
  if (status === "UNAVAILABLE" || minimumAcceptableOdds === null) {
    return (
      <div className="validity validity--unavailable">
        <p className="validity__note">
          {match.currentOdds === null
            ? t("priceValidityNoPrice")
            : t("priceValidityNoModel")}
        </p>
      </div>
    );
  }

  const current = match.currentOdds === null ? null : Number(match.currentOdds);
  const breakEven = breakEvenOdds === null ? null : Number(breakEvenOdds);
  const minimum = Number(minimumAcceptableOdds);

  /*
   * Purely positional: where the marks sit on the drawn line. This is
   * presentation geometry, not a threshold -- the thresholds themselves
   * arrive already decided, and the verdict shown is `status`, never
   * something recomputed from these coordinates.
   */
  const floor = breakEven === null ? minimum : Math.min(breakEven, minimum);
  const ceiling = Math.max(minimum, current ?? minimum) * 1.15;
  const span = ceiling - floor || 1;
  const position = (value: number) =>
    `${Math.min(100, Math.max(0, ((value - floor) / span) * 100))}%`;

  return (
    <div className="validity">
      <div className="validity__head">
        <Badge tone={priceValidityTone(status)}>
          {priceValidityLabel(status, locale)}
        </Badge>
        <span className="validity__policy">
          {t("priceValidityPolicy", { version: policyVersion })}
        </span>
      </div>

      <div className="validity__scale" aria-hidden="true">
        <span className="validity__track" />
        {breakEven === null ? null : (
          <span
            className="validity__mark validity__mark--breakeven"
            style={{ left: position(breakEven) }}
          />
        )}
        <span
          className="validity__mark validity__mark--minimum"
          style={{ left: position(minimum) }}
        />
        {current === null ? null : (
          <span
            className="validity__mark validity__mark--current"
            style={{ left: position(current) }}
          />
        )}
      </div>

      <dl className="validity__figures">
        {breakEven === null ? null : (
          <div>
            <dt>{t("priceValidityBreakEven")}</dt>
            <dd>{formatOdds(breakEvenOdds, locale)}</dd>
          </div>
        )}
        <div>
          <dt>{t("priceValidityMinimum")}</dt>
          <dd>{formatOdds(minimumAcceptableOdds, locale)}</dd>
        </div>
        <div className="validity__figures-current">
          <dt>{t("priceValidityCurrent")}</dt>
          <dd>
            {match.currentOdds === null
              ? "—"
              : formatOdds(match.currentOdds, locale)}
          </dd>
          {/*
           * "Best of N": currentOdds is already the best price across every
           * bookmaker observed at the latest instant (summariseOddsMovement),
           * this just makes that fact legible. Never names which bookmakers.
           */}
          {match.bookmakerCount ? (
            <span className="validity__figures-bookmakers">
              {t("priceValidityBestOf", { count: String(match.bookmakerCount) })}
            </span>
          ) : null}
        </div>
      </dl>
    </div>
  );
}

/**
 * Every other market this fixture has a real decision for, beyond the
 * match-result headline the rest of this page describes -- today, that
 * means FT Over/Under 2.5's OVER and UNDER selections.
 *
 * Renders nothing when the array is empty, which is the normal, honest
 * state for a fixture the totals writer has not priced yet: VELYQ is not a
 * tipster, and an absent section here is exactly as legitimate as zero EDGE
 * on the headline market. Never fabricated to fill the space, and every
 * number comes straight from `secondaryMarkets`, computed server-side by
 * the same decision engine and freshness policy as the headline card.
 */
export function SecondaryMarkets({
  match,
  locale,
}: {
  match: CustomerMatchDto;
  locale: Locale;
}) {
  const t = translator(locale);
  const markets = match.secondaryMarkets ?? [];
  if (markets.length === 0) return null;

  return (
    <div className="secondary-markets">
      {markets.map((row: CustomerSecondaryMarketDto) => (
        <div
          className="secondary-markets__row"
          key={`${row.marketCode}:${row.selection}`}
        >
          <div className="secondary-markets__heading">
            <span className="secondary-markets__market">
              {marketLabel(row.marketLabelKey, locale)}
              {row.lineValue ? ` ${row.lineValue}` : ""}
            </span>
            <Badge tone={recommendationTone(row.recommendation)}>
              {recommendationLabel(row.recommendation, locale)}
            </Badge>
          </div>
          <dl className="secondary-markets__figures">
            <div>
              <dt>{t("matchSelection")}</dt>
              <dd>{selectionLabel(row.selection, locale)}</dd>
            </div>
            <div>
              <dt>{t("priceValidityCurrent")}</dt>
              <dd>
                {row.currentOdds === null
                  ? "—"
                  : formatOdds(row.currentOdds, locale)}
              </dd>
            </div>
            <div>
              <dt>{t("matchModelShort")}</dt>
              <dd>
                {row.modelProbability === null
                  ? "—"
                  : formatProbability(row.modelProbability, locale)}
              </dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  );
}

/**
 * A settled fixture's own real record: what was decided, what the market's
 * closing price was, and how it settled -- never generated commentary.
 * Every field here is a stored value (a reason code, a snapshot number, a
 * settlement outcome) VELYQ already computed; nothing is inferred or
 * written about the match after the fact.
 */
function settlementLabel(
  value: "WIN" | "LOSS" | "VOID" | "UNSETTLED",
  locale: Locale,
): string {
  return (
    {
      en: { WIN: "Win", LOSS: "Loss", VOID: "Void", UNSETTLED: "Unsettled" },
      el: { WIN: "Νίκη", LOSS: "Ήττα", VOID: "Άκυρο", UNSETTLED: "Εκκρεμεί" },
    }[locale][value]
  );
}

export function PostMatchAutopsy({
  autopsy,
  locale,
}: {
  autopsy: PostMatchAutopsyDto;
  locale: Locale;
}) {
  const t = translator(locale);
  return (
    <div className="autopsy">
      <p className="autopsy__score">
        {t("matchAutopsyFinalScore")}: {autopsy.finalScore}
      </p>
      <div className="autopsy-rows">
        {autopsy.rows.map((row) => (
          <div
            className="autopsy-rows__row"
            key={`${row.marketLabelKey}:${row.selection}`}
          >
            <div className="autopsy-rows__heading">
              <span className="autopsy-rows__market">
                {marketLabel(row.marketLabelKey, locale)}
                {row.lineValue ? ` ${row.lineValue}` : ""}
                {" · "}
                {selectionLabel(row.selection, locale)}
              </span>
              <Badge
                tone={
                  row.outcome === "WIN"
                    ? "positive"
                    : row.outcome === "LOSS"
                      ? "caution"
                      : "neutral"
                }
              >
                {settlementLabel(row.outcome, locale)}
              </Badge>
            </div>
            <dl className="autopsy-rows__figures">
              <div>
                <dt>{t("matchDecision")}</dt>
                <dd>{recommendationLabel(row.decisionStatus, locale)}</dd>
              </div>
              <div>
                <dt>{t("matchModelShort")}</dt>
                <dd>
                  {row.modelProbability === null
                    ? "—"
                    : formatProbability(row.modelProbability, locale)}
                </dd>
              </div>
              <div>
                <dt>{t("matchAutopsyDecisionOdds")}</dt>
                <dd>
                  {row.offeredOdds === null
                    ? "—"
                    : formatOdds(row.offeredOdds, locale)}
                </dd>
              </div>
              <div>
                <dt>{t("matchAutopsyClosingOdds")}</dt>
                <dd>
                  {row.closingOdds === null
                    ? "—"
                    : formatOdds(row.closingOdds, locale)}
                </dd>
              </div>
              <div>
                <dt>{t("historyPositiveClv")}</dt>
                <dd>
                  {row.clv === null ? "—" : formatPercent(row.clv, 1, locale)}
                </dd>
              </div>
            </dl>
            {row.whyNotCodes.length > 0 ? (
              <div className="reasons">
                {reasonLabels(row.whyNotCodes, locale).map((reason) => (
                  <Badge key={reason} tone="muted">
                    {reason}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Why VELYQ sees this, why it does not, and what would overturn either.
 *
 * Every line is keyed off a state the server already decided -- a validity
 * status, a freshness state, a lineup state, a quality grade, a
 * recommendation. Nothing here compares a number against a threshold of its
 * own, so no sentence can assert something the engine did not.
 *
 * The negative half is deliberately given the same weight as the positive
 * one. A refusal is a result, and for a decision-support product the reason
 * behind it is usually the more useful half.
 */
export function DecisionReasoning({
  match,
  locale,
}: {
  match: CustomerMatchDto;
  locale: Locale;
}) {
  const t = translator(locale);
  const validity = match.priceValidity.status;

  const supporting: string[] = [];
  /*
   * STRONG_EDGE is the engine's own statement that the model sits above the
   * market here, so it is read rather than re-derived from the numbers.
   */
  if (match.recommendation === "STRONG_EDGE")
    supporting.push(t("whyModelAboveMarket"));
  if (validity === "ATTRACTIVE") supporting.push(t("whyPriceClears"));
  if (validity === "MARGINAL") supporting.push(t("whyPriceMarginal"));
  if (validity === "AT_FAIR") supporting.push(t("whyPriceAtFair"));
  /* Only CURRENT supports acting. AGING is informative but not actionable,
     which is exactly the distinction the four-state DTO exists to keep. */
  if (match.freshness === "CURRENT") supporting.push(t("whyEvidenceCurrent"));
  if (match.lineup === "OFFICIAL") supporting.push(t("whyLineupOfficial"));
  if (match.quality.reasonCodes.length === 0)
    supporting.push(t("whyQualityPassed"));
  if (match.movementState !== "INSUFFICIENT_HISTORY")
    supporting.push(t("whyMovementObserved"));

  /*
   * The blocking half. Quality reason codes are the engine's own vocabulary
   * for what is wrong; the recommendation explanation covers the states that
   * are not quality failures, such as waiting on a lineup.
   */
  const blocking = reasonLabels(match.quality.reasonCodes, locale);
  const gatedExplanation = isGatedRecommendation(match.recommendation)
    ? recommendationExplanation(match.recommendation, locale)
    : null;

  /*
   * Invalidation, stated from the same policy that produced the verdict. The
   * price threshold is the authoritative `minimumAcceptableOdds`, never a
   * margin computed here.
   */
  const invalidation: string[] = [];
  if (match.priceValidity.minimumAcceptableOdds !== null)
    invalidation.push(
      t("invalidIfPriceBelow", {
        price: formatOdds(match.priceValidity.minimumAcceptableOdds, locale),
      }),
    );
  if (match.freshness === "CURRENT") invalidation.push(t("invalidIfStale"));
  if (match.lineup === "OFFICIAL")
    invalidation.push(t("invalidIfLineupChanges"));
  if (match.lineup === "MISSING" || match.lineup === "EXPECTED")
    invalidation.push(t("invalidIfLineupArrives"));
  invalidation.push(t("invalidIfQualityFalls"));

  return (
    <div className="reasoning">
      <section className="reasoning__half">
        <h3 className="reasoning__title">{t("reasoningWhyTitle")}</h3>
        <p className="reasoning__lead">{t("reasoningWhyLead")}</p>
        {supporting.length === 0 ? (
          <p className="reasoning__empty">{t("reasoningWhyNone")}</p>
        ) : (
          <ul className="reasoning__list reasoning__list--for">
            {supporting.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="reasoning__half">
        <h3 className="reasoning__title">{t("reasoningWhyNotTitle")}</h3>
        <p className="reasoning__lead">{t("reasoningWhyNotLead")}</p>
        {blocking.length === 0 && gatedExplanation === null ? (
          <p className="reasoning__empty">{t("reasoningWhyNotNone")}</p>
        ) : (
          <ul className="reasoning__list reasoning__list--against">
            {gatedExplanation ? <li>{gatedExplanation}</li> : null}
            {blocking.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="reasoning__invalidation">
        <h3 className="reasoning__title">{t("reasoningInvalidationTitle")}</h3>
        <p className="reasoning__lead">{t("reasoningInvalidationLead")}</p>
        <ul className="reasoning__list reasoning__list--invalidation">
          {invalidation.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
