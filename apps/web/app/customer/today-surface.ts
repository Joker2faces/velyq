import type {
  CustomerMatchDto,
  CustomerTodayAggregateDto,
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
  /**
   * Real counts over the WHOLE day's fixtures (before the preview slice
   * above), so "no match clears the threshold" is checkable even on a
   * preview account that only sees a handful of `matches`.
   */
  readonly summary: CustomerTodayAggregateDto;
  readonly withheld: number;
  readonly surface: "today" | "edge" | "radar";
  readonly full: boolean;
};
