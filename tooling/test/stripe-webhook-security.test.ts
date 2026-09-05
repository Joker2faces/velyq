import { describe, expect, it } from "vitest";
import { POST } from "../../apps/web/app/api/v1/billing/webhook/route";

describe("Stripe webhook security boundary", () => {
  it("rejects missing signature before touching the database", async () => {
    const response = await POST(
      new Request("https://velyq.test/api/v1/billing/webhook", {
        method: "POST",
        body: "{}",
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Webhook unavailable" });
  });

  it("rejects an invalid signature", async () => {
    const previous = {
      secret: process.env["STRIPE_WEBHOOK_SECRET"],
      database: process.env["VELYQ_DATABASE_URL"],
      stripe: process.env["STRIPE_SECRET_KEY"],
    };
    process.env["STRIPE_WEBHOOK_SECRET"] = "whsec_test";
    process.env["VELYQ_DATABASE_URL"] = "postgresql://invalid";
    process.env["STRIPE_SECRET_KEY"] = "sk_test_invalid";
    try {
      const response = await POST(
        new Request("https://velyq.test/api/v1/billing/webhook", {
          method: "POST",
          headers: { "stripe-signature": "invalid" },
          body: "{}",
        }),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Invalid signature" });
    } finally {
      for (const [name, value] of Object.entries({
        STRIPE_WEBHOOK_SECRET: previous.secret,
        VELYQ_DATABASE_URL: previous.database,
        STRIPE_SECRET_KEY: previous.stripe,
      })) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
});
