import type {
  CustomerMatchDto,
  CustomerSuppressionDto,
} from "@velyq/contracts";

/**
 * What `/api/v1/today` returns to a customer surface.
 *
 * `matches` is already narrowed to what this customer may see — the API
 * applies the preview boundary from their own entitlements — and `withheld`
 * is the count it held back, so the UI can offer the upgrade without the
 * withheld rows ever crossing the wire. `full` says which side of that
 * boundary the customer is on; it is the server's answer, never a request
 * parameter.
 */
export type TodaySurfaceDto = {
  readonly syntheticLabel: string;
  readonly asOf: string;
  readonly matches: readonly CustomerMatchDto[];
  readonly withheld: number;
  readonly surface: "today" | "edge" | "radar";
  readonly full: boolean;
  /**
   * Events the provider delivered that the intelligence universe excludes, as
   * a count and reasons rather than as rows. Distinct from `withheld`, which
   * is about this customer's entitlement: `suppressed` is the same for every
   * customer and is about what the model can justify at all.
   */
  readonly suppressed?: CustomerSuppressionDto;
};
