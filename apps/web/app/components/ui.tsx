import type { CSSProperties, ReactNode } from "react";
import { axisPercent, barPercent, directionOf, type Tone } from "@velyq/ui";
import {
  IconAlert,
  IconArrowDown,
  IconArrowRight,
  IconArrowUp,
  IconMinus,
} from "./icons";

/**
 * Presentation primitives shared by every customer surface.
 *
 * All of these are server components. None of them holds state, so the
 * customer app ships essentially no client JavaScript beyond the language
 * switcher and the password reveal.
 */

// ------------------------------------------------------------------ badge

export function Badge({
  children,
  tone = "neutral",
  dot = false,
  emphasis,
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  /**
   * Which badge on a surface is the headline.
   *
   * `lead` is the verdict — at most one per surface. `supporting` keeps the
   * semantic hue on the dot and the label but drops the tinted fill, so a
   * quality grade sitting beside a verdict no longer reads as a second,
   * equally weighted answer.
   */
  emphasis?: "lead" | "supporting" | undefined;
}) {
  return (
    <span
      className={`badge badge--${tone}${emphasis ? ` badge--${emphasis}` : ""}`}
    >
      {dot ? <span className="badge__dot" /> : null}
      {children}
    </span>
  );
}

// ------------------------------------------------------------------- card

export function Card({
  children,
  className = "",
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <section
      className={`card${interactive ? " card--interactive" : ""}${
        className ? ` ${className}` : ""
      }`}
    >
      {children}
    </section>
  );
}

export function CardHead({
  title,
  hint,
  aside,
  level = 2,
}: {
  title: string;
  hint?: string;
  aside?: ReactNode;
  level?: 2 | 3;
}) {
  const Heading = level === 3 ? "h3" : "h2";
  return (
    <div className="card__head">
      <div>
        <Heading>{title}</Heading>
        {hint ? <p className="card__hint">{hint}</p> : null}
      </div>
      {aside}
    </div>
  );
}

// ------------------------------------------------------------------- stat

export function Stat({
  label,
  value,
  tone,
  size,
  boxed = false,
  hint,
}: {
  label: string;
  value: string;
  /* `undefined` is explicit because the workspace enables
     exactOptionalPropertyTypes and call sites pass a conditional tone.
     `market` marks a figure the market produced rather than the model, and is
     the correct tone for observed price movement in either direction. */
  tone?: "positive" | "negative" | "market" | undefined;
  size?: "lg" | undefined;
  boxed?: boolean;
  hint?: string | undefined;
}) {
  const valueClass = [
    "stat__value",
    tone ? `stat__value--${tone}` : "",
    size === "lg" ? "stat__value--lg" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={`stat${boxed ? " stat--boxed" : ""}`}>
      <span className="stat__label">
        {label}
        {hint ? (
          <span className="hint" title={hint} aria-hidden="true">
            ?
          </span>
        ) : null}
      </span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}

// -------------------------------------------------------------------- bar

/**
 * A single proportional bar.
 *
 * `value` and `magnitude` are presentation inputs: the fill is derived with
 * `barPercent`, which parses the canonical decimal string to a plain number
 * before any arithmetic. No branded decimal value is ever operated on.
 */
export function Bar({
  value,
  magnitude,
  tone = "pitch",
  label,
}: {
  value: string | null | undefined;
  magnitude: number;
  tone?: "pitch" | "caution" | "market" | "negative" | "muted";
  label?: string;
}) {
  const percent = barPercent(value, magnitude);
  const fillClass =
    tone === "pitch" ? "bar__fill" : `bar__fill bar__fill--${tone}`;
  return (
    <div
      className="bar"
      {...(label
        ? { role: "img", "aria-label": label }
        : { "aria-hidden": true })}
    >
      <span className={fillClass} style={{ width: `${percent}%` }} />
    </div>
  );
}

/**
 * Two labelled bars on a shared 0–100 axis, used to put model probability
 * next to the probability the market implies.
 */
export function Compare({
  rows,
}: {
  rows: readonly {
    name: string;
    display: string;
    value: string | null;
    tone?: "pitch" | "caution" | "market" | "muted";
  }[];
}) {
  return (
    <div className="compare">
      {rows.map((row) => (
        <div className="compare__row" key={row.name}>
          <span className="compare__name">{row.name}</span>
          <Bar
            value={row.value}
            magnitude={1}
            tone={row.tone ?? "pitch"}
            label={`${row.name}: ${row.display}`}
          />
          <span className="compare__value">{row.display}</span>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------- edge axis

/**
 * The EDGE axis — VELYQ's signature analytic visual.
 *
 * One 0-100% probability scale carrying both the market's implied
 * probability and the model's probability. The shaded span between them is
 * the edge itself, so the reader sees the gap instead of subtracting two
 * percentages in their head.
 *
 * Marker positions are derived with `axisPercent`, which parses the
 * canonical decimal string to a plain number first; no arithmetic is ever
 * performed on a branded domain value.
 */
export function EdgeAxis({
  modelProbability,
  impliedProbability,
  modelDisplay,
  impliedDisplay,
  modelLabel,
  marketLabel,
  caption,
}: {
  modelProbability: string | null;
  impliedProbability: string | null;
  modelDisplay: string;
  impliedDisplay: string;
  modelLabel: string;
  marketLabel: string;
  caption: string;
}) {
  const model = axisPercent(modelProbability);
  const market = axisPercent(impliedProbability);
  if (model === null || market === null) return null;

  const start = Math.min(model, market);
  const width = Math.abs(model - market);
  const modelIsAhead = model >= market;

  return (
    <figure className="edgeaxis" style={{ margin: 0 }}>
      <div
        className="edgeaxis__track"
        role="img"
        aria-label={caption}
        style={
          {
            "--span-start": `${start}%`,
            "--span-width": `${width}%`,
            "--model-position": `${model}%`,
            "--market-position": `${market}%`,
          } as CSSProperties
        }
      >
        <span
          className={`edgeaxis__span${modelIsAhead ? "" : " edgeaxis__span--negative"}`}
        />
        <span className="edgeaxis__marker edgeaxis__marker--market" />
        <span className="edgeaxis__marker edgeaxis__marker--model" />
      </div>
      {/* The scale the two markers are read against. Without it the track is
          an unlabelled rail and a six-point edge looks arbitrary rather than
          small-but-real. */}
      <div className="edgeaxis__scale" aria-hidden="true">
        <span>0%</span>
        <span>100%</span>
      </div>
      <div className="edgeaxis__legend">
        <span className="edgeaxis__key">
          <span className="edgeaxis__swatch edgeaxis__swatch--model" />
          {modelLabel}
          <b className="edgeaxis__value">{modelDisplay}</b>
        </span>
        <span className="edgeaxis__key">
          <span className="edgeaxis__swatch edgeaxis__swatch--market" />
          {marketLabel}
          <b className="edgeaxis__value">{impliedDisplay}</b>
        </span>
      </div>
    </figure>
  );
}

// ------------------------------------------------------------- sparkline

/**
 * Minimal two-to-many point sparkline.
 *
 * `pathLength={1}` normalises the stroke dash so the reveal animation works
 * regardless of the real path length.
 */
export function Sparkline({
  points,
  tone = "pitch",
  label,
}: {
  points: readonly number[];
  /**
   * `market` is the correct tone for an observed price history: it is market
   * evidence, not model output, and colouring it with the brand accent both
   * overstated it and spent green on something VELYQ did not conclude.
   */
  tone?: "pitch" | "caution" | "market";
  label: string;
}) {
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const width = 100;
  const height = 30;
  const step = width / (points.length - 1);
  const coords = points.map((point, index) => {
    const x = index * step;
    const y = height - ((point - min) / span) * (height - 6) - 3;
    return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
  });
  const last = coords[coords.length - 1]?.split(",") ?? ["0", "0"];
  return (
    <svg
      className="spark"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <polyline
        className={
          tone === "pitch" ? "spark__line" : `spark__line spark__line--${tone}`
        }
        pathLength={1}
        points={coords.join(" ")}
      />
      <circle
        className={
          tone === "pitch" ? "spark__dot" : `spark__dot spark__dot--${tone}`
        }
        cx={last[0]}
        cy={last[1]}
        r="2.4"
      />
    </svg>
  );
}

// ------------------------------------------------------------------ trend

/**
 * Signed movement with a direction arrow.
 *
 * Every direction takes the same market hue. A price that shortened is not
 * "good" and one that drifted is not "bad" — which way it moved is an
 * observation about the market, and whether it helps depends on the position
 * a reader holds. This previously rendered a fall in the brand mint and a
 * rise in amber, which told the reader the market agreeing with the model was
 * a win and spent the accent on something that is not VELYQ's judgement.
 *
 * Direction is therefore carried by three non-colour channels: the arrow, the
 * sign in `display`, and the optional `gloss` naming it in words. That is also
 * what a reader who cannot separate the two hues needs.
 */
export function Trend({
  value,
  display,
  caption,
  gloss,
}: {
  value: string | null | undefined;
  display: string;
  caption?: string;
  /** The direction in words, e.g. "Price shortened in". */
  gloss?: string | undefined;
}) {
  const direction = directionOf(value);
  const Arrow =
    direction === "up"
      ? IconArrowUp
      : direction === "down"
        ? IconArrowDown
        : IconMinus;
  return (
    <span className={`trend trend--${direction}`}>
      {direction === "unknown" ? null : <Arrow size={13} />}
      <span>{display}</span>
      {gloss ? <span className="trend__gloss">{gloss}</span> : null}
      {caption ? <span className="sr-only">{caption}</span> : null}
    </span>
  );
}

// ------------------------------------------------------------ definitions

export function DefinitionList({
  items,
}: {
  items: readonly { term: string; value: string }[];
}) {
  return (
    <dl className="dl">
      {items.map((item) => (
        <div key={item.term}>
          <dt>{item.term}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// -------------------------------------------------------------- explainer

/**
 * Progressive disclosure for glossary content.
 *
 * `<details>` gives keyboard operation, screen-reader expanded state and
 * in-page find-on-page support for free, with no client JavaScript.
 */
export function Explain({
  title,
  children,
  open = false,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className="explain" {...(open ? { open: true } : {})}>
      <summary>{title}</summary>
      <div className="explain__body">{children}</div>
    </details>
  );
}

// ------------------------------------------------------------ page states

export function EmptyState({
  title,
  body,
  action,
  center = false,
  as = "h2",
}: {
  title: string;
  body: string;
  action?: ReactNode;
  center?: boolean;
  /** Use `h1` when this state replaces the entire page. */
  as?: "h1" | "h2";
}) {
  const Heading = as;
  return (
    <div className={`state${center ? " state--center" : ""}`}>
      <Heading>{title}</Heading>
      <p>{body}</p>
      {action}
    </div>
  );
}

/**
 * Error state. `role="alert"` is correct here because this element replaces
 * page content on a failed load, which is exactly the announcement a
 * customer needs.
 */
export function ErrorState({
  title,
  body,
  action,
  as = "h1",
}: {
  title: string;
  body: string;
  action?: ReactNode;
  /**
   * Defaults to `h1`: an error state almost always replaces the whole page,
   * and a page with no top-level heading is a real navigation failure for
   * screen-reader users.
   */
  as?: "h1" | "h2";
}) {
  const Heading = as;
  return (
    <div className="card">
      <div className="state" role="alert">
        <IconAlert size={22} className="state__icon" />
        <Heading>{title}</Heading>
        <p>{body}</p>
        {action}
      </div>
    </div>
  );
}

export function Skeleton({
  variant = "line",
  width,
}: {
  variant?: "line" | "title" | "block" | "pill" | "figure";
  width?: string;
}) {
  return (
    <span
      className={`skeleton skeleton--${variant}`}
      style={{ display: "block", ...(width ? { width } : {}) }}
    />
  );
}

/**
 * The loading state for an intelligence surface.
 *
 * The customer shells are static and fetch their data in the browser, so this
 * is the first thing every visitor to Today, EDGE and RADAR sees — which
 * makes matching the real page's geometry the whole job. The previous
 * skeleton was two cards of stacked bars with no gap between them, so it read
 * as a pair of grey slabs and then reflowed the page entirely when the data
 * arrived.
 *
 * This mirrors the shape all three surfaces actually render: a page head, the
 * lead panel that answers the page's question, a row of summary figures and a
 * two-card split. Same containers, same gaps, so the content lands in place
 * instead of pushing the page around.
 */
export function SurfaceSkeleton({ label }: { label: string }) {
  return (
    <div className="page" aria-busy="true">
      <span className="sr-only" role="status" aria-live="polite">
        {label}
      </span>
      <div aria-hidden="true">
        <div className="page__head">
          <div className="page__head-copy skeleton-stack">
            <Skeleton width="min(18rem, 70%)" />
            <Skeleton variant="title" />
            <Skeleton width="min(14rem, 55%)" />
          </div>
          <div className="page__badges">
            <Skeleton variant="pill" width="7.5rem" />
            <Skeleton variant="pill" width="9rem" />
          </div>
        </div>

        <div className="stack">
          <div className="card skeleton-stack">
            <Skeleton variant="pill" width="8rem" />
            <Skeleton width="92%" />
            <Skeleton width="74%" />
            <Skeleton variant="figure" width="min(12rem, 60%)" />
          </div>

          <div className="stat-row">
            <div className="card skeleton-stack">
              <Skeleton width="70%" />
              <Skeleton variant="figure" width="4rem" />
            </div>
            <div className="card skeleton-stack">
              <Skeleton width="70%" />
              <Skeleton variant="figure" width="4rem" />
            </div>
            <div className="card skeleton-stack">
              <Skeleton width="70%" />
              <Skeleton variant="figure" width="4rem" />
            </div>
            <div className="card skeleton-stack">
              <Skeleton width="70%" />
              <Skeleton variant="figure" width="4rem" />
            </div>
          </div>

          <div className="split">
            <div className="card skeleton-stack">
              <Skeleton width="55%" />
              <Skeleton variant="block" />
            </div>
            <div className="card skeleton-stack">
              <Skeleton width="55%" />
              <Skeleton variant="block" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------- link/CTA

export function ArrowLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a className="link" href={href}>
      {children}
      <IconArrowRight className="link__arrow" />
    </a>
  );
}
