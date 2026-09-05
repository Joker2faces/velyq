/**
 * The VELYQ mark — geometry only.
 *
 * The idea: a Q is a circle with a tail; a football pitch's centre circle is
 * a circle with the halfway line running through it. They are the same shape,
 * so the mark is both at once.
 *
 *   bowl  the centre circle
 *   spot  the kick-off spot at its centre
 *   tail  the halfway line breaking out of the circle to the lower right,
 *         which doubles as the signal trajectory used across the product
 *
 * Three elements is the most that survives a 16px favicon, which is why there
 * is no pitch outline, no ball and no additional arc.
 *
 * Exported as plain geometry rather than as a component so that both the
 * customer app and the admin console draw the identical mark without
 * `@velyq/ui` taking on a React dependency.
 */

/** All coordinates below are on this square canvas. */
export const BRAND_MARK_VIEWBOX = "0 0 32 32";

/** Centre circle. */
export const BRAND_MARK_CIRCLE = { cx: 16, cy: 16, r: 9.2 } as const;

/** Kick-off spot. */
export const BRAND_MARK_SPOT = { cx: 16, cy: 16, r: 2.15 } as const;

/**
 * The tail, starting inside the bowl and crossing the circle edge at 45°, so
 * it reads as a descender on the Q and as a line leaving the centre circle on
 * a pitch. It stops well short of the canvas edge: at full bleed the tile's
 * rounded corner clipped it.
 */
export const BRAND_MARK_TAIL = "M18.6 18.6 25.4 25.4" as const;

/** Stroke width for the circle and tail, on the 32-unit canvas. */
export const BRAND_MARK_STROKE = 2.9;

/** Corner radius for the tile the favicon sits on. */
export const BRAND_TILE_RADIUS = 7;
