import {
  parseDecimalString,
  subtractDecimalStrings,
  type DecimalString,
} from "@velyq/decimal";

export const RANK_POLICY_VERSION = "rank.v1" as const;

export type OpportunityFreshness = "FRESH" | "STALE" | "MISSING";

export type OpportunityInput = Readonly<{
  readonly id: string;
  readonly expectedValue: string | null;
  readonly freshness: OpportunityFreshness;
  readonly actionable: boolean;
}>;

export type RankedOpportunity = OpportunityInput &
  Readonly<{
    readonly policyVersion: typeof RANK_POLICY_VERSION;
    readonly rank: number;
    readonly expectedValue: DecimalString | null;
    readonly reasonCodes: readonly string[];
  }>;

function validExpectedValue(value: string | null): DecimalString | null {
  if (value === null) return null;
  const parsed = parseDecimalString(value);
  return parsed.ok ? parsed.value : null;
}

function compareExpectedValue(
  left: DecimalString | null,
  right: DecimalString | null,
): number {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  const difference = subtractDecimalStrings(right, left);
  if (!difference.ok || difference.value === ("0" as DecimalString)) return 0;
  return difference.value.startsWith("-") ? -1 : 1;
}

function priority(input: OpportunityInput): number {
  if (input.actionable && input.freshness === "FRESH") return 0;
  if (input.actionable) return 1;
  return 2;
}

function reasonCodes(
  input: OpportunityInput,
  expectedValue: DecimalString | null,
): readonly string[] {
  return Object.freeze([
    ...(input.freshness === "FRESH" ? [] : ["STALE_OR_MISSING_FRESHNESS"]),
    ...(input.actionable ? [] : ["NOT_ACTIONABLE"]),
    ...(input.expectedValue !== null && !expectedValue
      ? ["INVALID_EXPECTED_VALUE"]
      : []),
  ]);
}

/** Ranks usable opportunities before stale or non-actionable alternatives. */
export function rankOpportunities(
  opportunities: readonly OpportunityInput[],
): readonly RankedOpportunity[] {
  const ranked = opportunities
    .map((input) =>
      Object.freeze({
        input,
        expectedValue: validExpectedValue(input.expectedValue),
      }),
    )
    .sort((left, right) => {
      const priorityDifference = priority(left.input) - priority(right.input);
      if (priorityDifference !== 0) return priorityDifference;
      const valueDifference = compareExpectedValue(
        left.expectedValue,
        right.expectedValue,
      );
      return valueDifference !== 0
        ? valueDifference
        : left.input.id.localeCompare(right.input.id);
    })
    .map(({ input, expectedValue }, index) =>
      Object.freeze({
        ...input,
        policyVersion: RANK_POLICY_VERSION,
        rank: index + 1,
        expectedValue,
        reasonCodes: reasonCodes(input, expectedValue),
      }),
    );
  return Object.freeze(ranked);
}

/** Returns the deterministic rank order used for today's opportunity queue. */
export function prioritizeToday(
  opportunities: readonly OpportunityInput[],
): readonly RankedOpportunity[] {
  return rankOpportunities(opportunities);
}
