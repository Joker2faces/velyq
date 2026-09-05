import { describe, expect, it } from "vitest";
import {
  billingPriceConfiguration,
  planForPriceId,
  subscriptionPeriod,
} from "../../apps/web/app/billing";

describe("billing policy", () => {
  it("fails closed when paid price ids are missing or duplicated", () => {
    expect(billingPriceConfiguration({})).toBeNull();
    expect(
      billingPriceConfiguration({
        STRIPE_PRO_PRICE_ID: "price_same",
        STRIPE_ELITE_PRICE_ID: "price_same",
      }),
    ).toBeNull();
  });

  it("only maps explicitly configured Stripe prices", () => {
    const configuration = billingPriceConfiguration({
      STRIPE_PRO_PRICE_ID: "price_pro",
      STRIPE_ELITE_PRICE_ID: "price_elite",
    });
    expect(configuration).not.toBeNull();
    expect(planForPriceId("price_pro", configuration!)).toBe("PRO");
    expect(planForPriceId("price_elite", configuration!)).toBe("ELITE");
    expect(planForPriceId("price_unknown", configuration!)).toBeNull();
  });

  it("reads billing periods from the Stripe subscription item", () => {
    expect(
      subscriptionPeriod({
        current_period_start: 1_725_494_400,
        current_period_end: 1_728_086_400,
      }),
    ).toEqual({
      start: new Date("2024-09-05T00:00:00.000Z"),
      end: new Date("2024-10-05T00:00:00.000Z"),
    });
  });
});
