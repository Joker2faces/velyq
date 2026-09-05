/**
 * Pitch geometry.
 *
 * VELYQ's visual signature, drawn as real football pitch markings rather than
 * a generic grid: touchline, halfway line, centre circle and penalty area, in
 * the same line weight a tactics board uses. Decorative and inert.
 *
 * A generic square grid reads as "analytics dashboard". These markings are
 * the thing that makes the product legible as football at a glance, so they
 * are drawn accurately to the real proportions of a pitch half.
 */
export function PitchBackdrop() {
  return (
    <svg
      className="pitch-backdrop"
      viewBox="0 0 680 440"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="pitch-fade" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="70%" stopColor="#fff" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="pitch-mask">
          <rect width="680" height="440" fill="url(#pitch-fade)" />
        </mask>
      </defs>
      <g
        mask="url(#pitch-mask)"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
      >
        {/* Touchlines and goal line. */}
        <rect x="40" y="30" width="600" height="380" rx="2" />
        {/* Halfway line and centre circle. */}
        <path d="M340 30V410" />
        <circle cx="340" cy="220" r="72" />
        <circle cx="340" cy="220" r="3" fill="currentColor" stroke="none" />
        {/* Penalty areas and six-yard boxes. */}
        <rect x="40" y="106" width="118" height="228" />
        <rect x="40" y="164" width="44" height="112" />
        <rect x="522" y="106" width="118" height="228" />
        <rect x="596" y="164" width="44" height="112" />
        {/* Penalty spots and arcs. */}
        <circle cx="118" cy="220" r="2.5" fill="currentColor" stroke="none" />
        <circle cx="562" cy="220" r="2.5" fill="currentColor" stroke="none" />
        <path d="M158 176a72 72 0 0 1 0 88" />
        <path d="M522 176a72 72 0 0 0 0 88" />
        {/* Corner arcs. */}
        <path d="M40 40a10 10 0 0 0 10-10" />
        <path d="M640 40a10 10 0 0 1-10-10" />
        <path d="M40 400a10 10 0 0 1 10 10" />
        <path d="M640 400a10 10 0 0 0-10 10" />
      </g>
    </svg>
  );
}

/**
 * Scoreboard-style fixture header.
 *
 * Home and away separated by a centre rule that echoes the halfway line, with
 * competition and kick-off underneath — the way a fixture is presented on a
 * matchday board rather than as a row of table cells.
 */
export function Fixture({
  homeTeam,
  awayTeam,
  meta,
  size = "md",
}: {
  homeTeam: string;
  awayTeam: string;
  /** Competition, kick-off, market — whatever context the row carries. */
  meta?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div className={`fixture fixture--${size}`}>
      <div className="fixture__teams">
        <span className="fixture__team fixture__team--home">{homeTeam}</span>
        <span className="fixture__divider" aria-hidden="true" />
        <span className="fixture__team fixture__team--away">{awayTeam}</span>
      </div>
      {meta ? <p className="fixture__meta">{meta}</p> : null}
    </div>
  );
}
