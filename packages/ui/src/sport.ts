import type { Locale } from "./locale.js";
import { translate, type MessageKey } from "./messages.js";

/**
 * The sport a surface is reading.
 *
 * VELYQ is a sports market intelligence product that currently carries
 * football. Basketball is next, and others may follow, so the sport is a
 * property of the data being read rather than a fact about the product — which
 * is why the global brand no longer names one.
 *
 * Nothing here invents a sport. `SPORTS` is the vocabulary the presentation
 * layer can label; which of them a customer is actually offered comes from the
 * data, and `sportScope` returns a selector only once there is more than one
 * sport to choose between. A tab for a sport with nothing behind it is worse
 * than no tab at all: it promises coverage that does not exist.
 */

export const SPORTS = ["FOOTBALL", "BASKETBALL"] as const;

export type Sport = (typeof SPORTS)[number];

const SPORT_LABELS: Readonly<Record<Sport, MessageKey>> = {
  FOOTBALL: "sportFootball",
  BASKETBALL: "sportBasketball",
};

export function sportLabel(sport: string, locale: Locale) {
  const key = SPORT_LABELS[sport as Sport];
  if (key) return translate(key, locale);
  /* An unrecognised sport degrades to a readable form rather than throwing,
     so a sport added to the domain before this catalogue does not break a
     page. */
  const lower = sport.replaceAll("_", " ").toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function isSport(value: string): value is Sport {
  return (SPORTS as readonly string[]).includes(value);
}

/**
 * How a surface should present the sport it is showing.
 *
 * `single` is a statement — one sport is available, so naming it is context,
 * not a choice. `select` is a control, returned only when the customer has
 * somewhere to switch to. Deriving this from the available sports rather than
 * from a feature flag means the selector appears the day a second sport has
 * data behind it, and cannot appear before.
 */
export type SportScope =
  | { readonly kind: "none" }
  | { readonly kind: "single"; readonly sport: string }
  | {
      readonly kind: "select";
      readonly sports: readonly string[];
      readonly active: string;
    };

export function sportScope(
  available: readonly string[],
  active?: string | null,
): SportScope {
  const sports = [...new Set(available.filter((sport) => sport.trim() !== ""))];
  if (sports.length === 0) return { kind: "none" };
  if (sports.length === 1) return { kind: "single", sport: sports[0]! };
  const chosen = active && sports.includes(active) ? active : sports[0]!;
  return { kind: "select", sports, active: chosen };
}
