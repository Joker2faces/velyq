import { describe, expect, it } from "vitest";
import { GET as today } from "../../apps/web/app/api/v1/today/route";
import { GET as intelligence } from "../../apps/web/app/api/v1/events/[eventId]/intelligence/route";
import { GET as oddsHistory } from "../../apps/web/app/api/v1/events/[eventId]/odds-history/route";
import { POST as signIn } from "../../apps/web/app/api/v1/auth/sign-in/route";

async function problem(response: Response) {
  expect(response.status).toBe(401);
  return (await response.json()) as Record<string, unknown>;
}

describe("customer BFF contracts", () => {
  it("denies anonymous Today, intelligence, and odds-history requests uniformly", async () => {
    const request = new Request("https://velyq.test/api", {
      headers: { "x-request-id": "req-contract-1" },
    });
    for (const response of [
      await today(request),
      await intelligence(request, {
        params: Promise.resolve({ eventId: "event-1" }),
      }),
      await oddsHistory(request, {
        params: Promise.resolve({ eventId: "event-1" }),
      }),
    ]) {
      await expect(problem(response)).resolves.toEqual({
        type: "https://velyq.dev/problems/unauthorized",
        title: "Authentication required",
        status: 401,
        code: "UNAUTHORIZED",
        requestId: "req-contract-1",
      });
    }
  });

  it("rejects malformed sign-in input without contacting the provider", async () => {
    const response = await signIn(
      new Request("https://velyq.test/api/v1/auth/sign-in", {
        method: "POST",
        body: new URLSearchParams({ email: "", password: "" }),
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "INVALID_REQUEST",
      status: 400,
    });
  });
});
