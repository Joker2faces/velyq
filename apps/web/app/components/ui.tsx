import type { ReactNode } from "react";
import { barPercent, directionOf, type Tone } from "@velyq/ui";
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
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
}) {
  return (
    <span className={`badge badge--${tone}`}>
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
     exactOptionalPropertyTypes and call sites pass a conditional tone. */
  tone?: "positive" | "negative" | undefined;
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
  tone = "mint",
  label,
}: {
  value: string | null | undefined;
  magnitude: number;
  tone?: "mint" | "amber" | "lilac" | "rose" | "muted";
  label?: string;
}) {
  const percent = barPercent(value, magnitude);
  const fillClass =
    tone === "mint" ? "bar__fill" : `bar__fill bar__fill--${tone}`;
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
    tone?: "mint" | "amber" | "lilac" | "muted";
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
            tone={row.tone ?? "mint"}
            label={`${row.name}: ${row.display}`}
          />
          <span className="compare__value">{row.display}</span>
        </div>
      ))}
    </div>
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
  tone = "mint",
  label,
}: {
  points: readonly number[];
  tone?: "mint" | "amber";
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
          tone === "mint" ? "spark__line" : "spark__line spark__line--amber"
        }
        pathLength={1}
        points={coords.join(" ")}
      />
      <circle
        className={
          tone === "mint" ? "spark__dot" : "spark__dot spark__dot--amber"
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
 * Shortening odds (a negative move) is rendered as the mint "down" tone
 * because a falling price is the market agreeing with the position; drifting
 * odds are amber. The arrow is decorative — the sign is in the text.
 */
export function Trend({
  value,
  display,
  caption,
}: {
  value: string | null | undefined;
  display: string;
  caption?: string;
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
}: {
  title: string;
  body: string;
  action?: ReactNode;
  center?: boolean;
}) {
  return (
    <div className={`state${center ? " state--center" : ""}`}>
      <h2>{title}</h2>
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
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="card">
      <div className="state" role="alert">
        <IconAlert size={22} className="state__icon" />
        <h2>{title}</h2>
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
  variant?: "line" | "title" | "block";
  width?: string;
}) {
  return (
    <span
      className={`skeleton skeleton--${variant}`}
      style={{ display: "block", ...(width ? { width } : {}) }}
    />
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
