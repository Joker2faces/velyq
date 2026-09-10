import type { CustomerMatchDto } from "@velyq/contracts";
import Link from "next/link";
import {
  formatOdds,
  formatProbability,
  formatTime,
  freshnessLabel,
  freshnessTone,
  competitionLabel,
  recommendationLabel,
  recommendationTone,
  reasonLabel,
  selectionLabel,
  translator,
  type Locale,
} from "@velyq/ui";
import { Badge } from "./ui";

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
