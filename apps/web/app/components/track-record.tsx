import type { ReactNode } from "react";
import {
  calibrationLabel,
  calibrationTone,
  clvDirection,
  clvLabel,
  decisionQualityLabel,
  decisionQualityTone,
  isReportableSample,
  modelMaturityLabel,
  modelMaturityTone,
  outcomeLabel,
  outcomeTone,
  sampleSizeCaption,
  sportLabel,
  translator,
  type Locale,
  type SportScope,
} from "@velyq/ui";
import { Badge, EmptyState, Stat } from "./ui";
import { IconCheck, IconClock, IconShield } from "./icons";

/**
 * Presentation for VELYQ's track record.
 *
 * The product argument is "don't just trust VELYQ, verify its history", which
 * only holds if the record reads as an audit. Everything here is built so the
 * page cannot drift into being a scoreboard:
 *
 *   - A result is stated, never celebrated. `outcomeTone` gives a won market
 *     the same neutral tone as a lost one, because the accent belongs to the
 *     model and colouring results is the gamification this has to avoid.
 *   - Decision quality is a separate column with its own tone. A signal
 *     published at 1.85 against a fair 1.67 was a good decision whether or not
 *     it won; a winner taken at no edge was a bad decision that paid.
 *   - A rate drawn from too few settled signals is qualified on the same line
 *     as the rate, not in a footnote.
 *
 * None of these components holds a number. Every figure is passed in, and each
 * renders an honest empty state when there is nothing to show — there is no
 * validated history yet, and nothing here invents one.
 */

// --------------------------------------------------------- sport scope

/**
 * The sport a surface is reading.
 *
 * A statement when there is one sport, a control when there is more than one.
 * Driven by which sports actually have data, so the selector appears the day a
 * second sport does and cannot appear before it: a tab for a sport with
 * nothing behind it promises coverage that does not exist.
 */
export function SportScopeBar({
  scope,
  locale,
  hrefFor,
}: {
  scope: SportScope;
  locale: Locale;
  /** Omit to render the selector as plain labels rather than links. */
  hrefFor?: (sport: string) => string;
}) {
  const t = translator(locale);
  if (scope.kind === "none") return null;

  if (scope.kind === "single") {
    return (
      <p className="sportscope sportscope--single">
        <span className="sportscope__label">{t("sportScopeLabel")}</span>
        <span className="sportscope__current">
          {sportLabel(scope.sport, locale)}
        </span>
      </p>
    );
  }

  return (
    <nav className="sportscope" aria-label={t("sportScopeLabel")}>
      <span className="sportscope__label">{t("sportScopeLabel")}</span>
      <ul className="sportscope__options">
        {scope.sports.map((sport) => {
          const active = sport === scope.active;
          const label = sportLabel(sport, locale);
          return (
            <li key={sport}>
              {hrefFor ? (
                <a
                  className="sportscope__option"
                  href={hrefFor(sport)}
                  {...(active ? { "aria-current": "page" as const } : {})}
                >
                  {label}
                </a>
              ) : (
                <span
                  className="sportscope__option"
                  {...(active ? { "aria-current": "true" as const } : {})}
                >
                  {label}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// --------------------------------------------------- forecast integrity

/**
 * Why the record can be trusted: published ahead of the event, timestamped,
 * and not edited afterwards.
 *
 * Rendered as three verifiable statements rather than a claim about VELYQ's
 * character. `publishedAt` and `startsAt` are display strings prepared by the
 * caller; this component asserts nothing it has not been given, and drops the
 * before-kick-off line entirely when the caller cannot establish it.
 */
export function ForecastIntegrity({
  locale,
  publishedAt,
  publishedBeforeStart,
}: {
  locale: Locale;
  /** Formatted publication timestamp. */
  publishedAt: string;
  /**
   * Whether publication provably preceded the event. `undefined` means the
   * caller could not establish it, in which case nothing is claimed.
   */
  publishedBeforeStart?: boolean | undefined;
}) {
  const t = translator(locale);
  return (
    <div className="integrity">
      <ul className="integrity__points">
        <li>
          <IconClock size={14} />
          <span>
            {t("integrityPublished")} <b>{publishedAt}</b>
          </span>
        </li>
        {publishedBeforeStart === true ? (
          <li>
            <IconCheck size={14} />
            <span>{t("integrityBeforeKickoff")}</span>
          </li>
        ) : null}
        <li>
          <IconShield size={14} />
          <span>{t("integrityNoEdits")}</span>
        </li>
      </ul>
      <p className="integrity__caption">{t("integrityCaption")}</p>
    </div>
  );
}

// ---------------------------------------------------------- settled row

export type SettledSignal = {
  readonly id: string;
  readonly fixture: string;
  readonly sport: string;
  readonly market: string;
  readonly publishedAt: string;
  readonly publishedOdds: string;
  readonly closingOdds: string;
  /** Signed ratio as a canonical decimal string, or null when unobserved. */
  readonly clv: string | null;
  readonly clvDisplay: string;
  readonly outcome: string;
  readonly decisionQuality: string;
};

/**
 * One settled signal.
 *
 * Result and decision quality sit in adjacent columns with a visible
 * separation, which is the entire point: the reader is meant to notice when a
 * sound decision lost and when a poor one won.
 */
export function SettledSignalRow({
  signal,
  locale,
}: {
  signal: SettledSignal;
  locale: Locale;
}) {
  const t = translator(locale);
  const direction = clvDirection(signal.clv);
  return (
    <article className="settled">
      <div className="settled__head">
        <div className="settled__fixture">
          <span className="settled__teams">{signal.fixture}</span>
          <span className="settled__meta">
            {sportLabel(signal.sport, locale)} · {signal.market} ·{" "}
            {signal.publishedAt}
          </span>
        </div>
        <div className="settled__verdicts">
          <span className="settled__verdict">
            <span className="settled__verdict-label">
              {t("trackRecordDecisionHeading")}
            </span>
            <Badge
              tone={decisionQualityTone(signal.decisionQuality)}
              emphasis="lead"
            >
              {decisionQualityLabel(signal.decisionQuality, locale)}
            </Badge>
          </span>
          <span className="settled__verdict">
            <span className="settled__verdict-label">
              {t("trackRecordOutcomeHeading")}
            </span>
            <Badge tone={outcomeTone(signal.outcome)} emphasis="supporting">
              {outcomeLabel(signal.outcome, locale)}
            </Badge>
          </span>
        </div>
      </div>

      <div className="row__stats">
        <Stat
          label={t("trackPublishedOdds")}
          value={signal.publishedOdds}
          tone="market"
        />
        <Stat
          label={t("trackClosingOdds")}
          value={signal.closingOdds}
          tone="market"
        />
        <Stat
          label={t("trackClv")}
          value={signal.clvDisplay}
          tone="market"
          hint={t("trackClvHint")}
        />
      </div>

      <p className="settled__clv">{clvLabel(direction, locale)}</p>
    </article>
  );
}

// ------------------------------------------------------ record summary

/**
 * The headline statistics.
 *
 * `settledCount` gates the whole panel. Below the reportable threshold the
 * rates are withheld rather than shown with a caveat, because a hit rate over
 * eleven signals is not a hit rate — and a number on screen is read long
 * before the note under it.
 */
export function TrackRecordSummary({
  locale,
  settledCount,
  brierScore,
  calibration,
  modelMaturity,
  children,
}: {
  locale: Locale;
  settledCount: number;
  /** Formatted Brier score, or null when there is no reportable figure. */
  brierScore: string | null;
  calibration: string;
  modelMaturity: string;
  children?: ReactNode;
}) {
  const t = translator(locale);
  const reportable = isReportableSample(settledCount);

  return (
    <div className="record">
      <div className="record__figures">
        <Stat
          label={t("trackSampleSize")}
          value={String(settledCount)}
          size="lg"
        />
        {reportable && brierScore ? (
          <Stat
            label={t("trackBrier")}
            value={brierScore}
            size="lg"
            hint={t("trackBrierHint")}
          />
        ) : null}
      </div>

      <div className="record__bands">
        <span className="record__band">
          <span className="stat__label">{t("trackCalibration")}</span>
          <Badge tone={calibrationTone(calibration)} emphasis="supporting">
            {calibrationLabel(calibration, locale)}
          </Badge>
        </span>
        <span className="record__band">
          <span className="stat__label">{t("trackModelMaturity")}</span>
          <Badge tone={modelMaturityTone(modelMaturity)} emphasis="supporting">
            {modelMaturityLabel(modelMaturity, locale)}
          </Badge>
        </span>
      </div>

      {/* The qualification travels with the figures, not below the fold. */}
      <p className="record__sample">
        {sampleSizeCaption(settledCount, locale)}
      </p>
      {children}
    </div>
  );
}

/** Nothing has settled yet. A designed state, not a failure. */
export function TrackRecordEmpty({ locale }: { locale: Locale }) {
  const t = translator(locale);
  return (
    <EmptyState
      title={t("trackRecordEmpty")}
      body={t("trackRecordEmptyBody")}
    />
  );
}

// ------------------------------------------------------------ community

/**
 * Following a signal.
 *
 * Deliberately "following", never "bet". VELYQ cannot know that a wager was
 * placed without bookmaker-level verification, so the product never implies
 * one: "312 following" is a fact about this page, "312 users bet this" would
 * be an invention. The count is passed in and the element renders without one
 * rather than showing a placeholder number.
 */
export function FollowSignal({
  locale,
  following,
  followerCount,
}: {
  locale: Locale;
  following: boolean;
  /** Omit when no count is available; nothing is shown rather than a guess. */
  followerCount?: number | undefined;
}) {
  const t = translator(locale);
  const hasCount = typeof followerCount === "number" && followerCount >= 0;
  return (
    <div className="follow">
      <button
        type="button"
        className={`button button--ghost follow__button${
          following ? " follow__button--on" : ""
        }`}
        aria-pressed={following}
      >
        {following ? t("communityFollowing") : t("communityFollow")}
      </button>
      {hasCount ? (
        <span className="follow__count">
          {followerCount === 0
            ? t("communityFollowerNone")
            : t("communityFollowerCount").replace(
                "{count}",
                String(followerCount),
              )}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The community panel.
 *
 * Kept explicitly secondary: a quiet surface, small type, and a caption saying
 * what the number does not mean. It is a signal about attention, and attention
 * is not evidence.
 */
export function CommunityPulse({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const t = translator(locale);
  return (
    <aside className="pulse">
      <p className="pulse__head">
        <span className="eyebrow eyebrow--muted">{t("communityPulse")}</span>
      </p>
      {children}
      <p className="pulse__caption">{t("communityCaption")}</p>
    </aside>
  );
}
