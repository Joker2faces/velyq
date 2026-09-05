import {
  BRAND_MARK_CIRCLE,
  BRAND_MARK_SPOT,
  BRAND_MARK_STROKE,
  BRAND_MARK_TAIL,
  BRAND_MARK_VIEWBOX,
} from "@velyq/ui";

/**
 * The VELYQ mark: a Q whose bowl is a pitch centre circle.
 *
 * Decorative — the wordmark beside it carries the accessible name — so it is
 * hidden from assistive technology rather than duplicating "VELYQ".
 */
export function VelyqMark({ size = 26 }: { size?: number }) {
  return (
    <svg
      className="brand__logo"
      width={size}
      height={size}
      viewBox={BRAND_MARK_VIEWBOX}
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx={BRAND_MARK_CIRCLE.cx}
        cy={BRAND_MARK_CIRCLE.cy}
        r={BRAND_MARK_CIRCLE.r}
        fill="none"
        stroke="currentColor"
        strokeWidth={BRAND_MARK_STROKE}
      />
      <path
        d={BRAND_MARK_TAIL}
        fill="none"
        stroke="currentColor"
        strokeWidth={BRAND_MARK_STROKE}
        strokeLinecap="round"
      />
      <circle
        cx={BRAND_MARK_SPOT.cx}
        cy={BRAND_MARK_SPOT.cy}
        r={BRAND_MARK_SPOT.r}
        fill="currentColor"
      />
    </svg>
  );
}
