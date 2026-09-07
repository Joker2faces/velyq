import { afterEach, describe, expect, it } from "vitest";
import { POST } from "../app/api/v1/auth/sign-in/route";
import { adminRedirectUrl } from "../app/admin-api";

const environment = { ...process.env };

afterEach(() => {
  process.env = { ...environment };
});

describe("admin browser sign-in", () => {
  it("returns the sign-in UI route for browser-form errors instead of JSON", async () => {
    process.env = {
      ...environment,
      NODE_ENV: "production",
      VELYQ_APPLICATION_ORIGIN: "https://velyq-admin-staging.vercel.app",
    };
    const response = await POST(
      new Request(
        "https://velyq-admin-staging.vercel.app/api/v1/auth/sign-in",
        {
          method: "POST",
          headers: {
            accept: "text/html",
            origin: "https://velyq-admin-staging.vercel.app",
            "content-type": "application/x-www-form-urlencoded",
          },
          body: "",
        },
      ),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://velyq-admin-staging.vercel.app/?error=invalid",
    );
  });

  it("requires a configured production origin rather than reflecting a request host", () => {
    process.env = { ...environment, NODE_ENV: "production" };
    expect(
      adminRedirectUrl(
        new Request("https://preview.example.test/api/v1/auth/sign-in"),
        "/",
      ),
    ).toBeNull();
  });
});
