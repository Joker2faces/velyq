import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The EDGE and RADAR surfaces show a preview customer three matches and
 * withhold the rest. That slicing lived in `loadCustomerToday` — in the page
 * — while `/api/v1/today` returned the whole list to anyone holding
 * `today.view`.
 *
 * This is a product boundary rather than a confidentiality one: the Today
 * page shows a FREE customer every match anyway, so nothing secret was
 * exposed. But once the customer UI is a static shell, the API is the only
 * place the boundary can be applied at all, and `full` must be derived from
 * the customer's own grants rather than from anything the caller sends.
 */

const state = vi.hoisted(() => ({
  entitlements: ["today.view", "edge.preview", "radar.preview"] as string[],
  denied: null as Response | null,
  requestedEntitlement: null as string | null,
  matches: Array.from({ length: 7 }, (_, index) => ({
    eventId: `event-${index + 1}`,
  })),
}));

vi.mock("../app/api/auth", () => ({
  requireCustomerSession: async (_request: Request, entitlement?: string) => {
    state.requestedEntitlement = entitlement ?? "today.view";
    return state.denied;
  },
  requestId: () => "request-1",
  getCookie: () => "token",
  customerFixtureMode: () => false,
}));

vi.mock("../app/customer-runtime", () => ({
  customerService: async () => ({
    getToday: async () => ({
      ok: true,
      value: { syntheticLabel: "Synthetic data", matches: state.matches },
    }),
    close: async () => {},
  }),
  resolveCustomerContext: async () => ({
    email: "customer@example.test",
    plan: "FREE",
    status: null,
    entitlements: state.entitlements,
    isAdmin: false,
  }),
  unavailable: () => ({ status: 503, requestId: "request-1" }),
}));

beforeEach(() => {
  state.entitlements = ["today.view", "edge.preview", "radar.preview"];
  state.denied = null;
  state.requestedEntitlement = null;
});

afterEach(() => vi.resetModules());

async function get(url: string) {
  const { GET } = await import("../app/api/v1/today/route");
  return GET(new Request(url));
}

const BASE = "https://velyq.test/api/v1/today";

describe("today API entitlements", () => {
  it("returns every match on the plain today surface", async () => {
    const body = (await (await get(BASE)).json()) as { matches: unknown[] };
    expect(body.matches).toHaveLength(7);
  });

  it("withholds the full list from a preview-only EDGE customer", async () => {
    const body = (await (await get(`${BASE}?surface=edge`)).json()) as {
      matches: unknown[];
    };
    expect(body.matches).toHaveLength(3);
  });

  it("withholds the full list from a preview-only RADAR customer", async () => {
    const body = (await (await get(`${BASE}?surface=radar`)).json()) as {
      matches: unknown[];
    };
    expect(body.matches).toHaveLength(3);
  });

  it("gives the full list to a customer who actually holds edge.full", async () => {
    state.entitlements = ["today.view", "edge.full", "radar.full"];
    const body = (await (await get(`${BASE}?surface=edge`)).json()) as {
      matches: unknown[];
    };
    expect(body.matches).toHaveLength(7);
  });

  it("never lets the caller talk itself into the full EDGE view", async () => {
    /*
     * The decisive property: `full` is derived from the customer's own
     * entitlements, so nothing in the request can widen access. An
     * unrecognised surface falls back to `today`, which is not an escalation
     * — a FREE customer is entitled to the whole match list there, and the
     * Today page has always shown it. What must never happen is a preview
     * customer being served the EDGE surface as `full`.
     */
    for (const attempt of [
      `${BASE}?surface=edge&entitlement=edge.full`,
      `${BASE}?surface=edge&full=true`,
      `${BASE}?surface=EDGE`,
      `${BASE}?surface=../edge`,
    ]) {
      const body = (await (await get(attempt)).json()) as {
        matches: unknown[];
        full: boolean;
        surface: string;
      };
      // Never the EDGE surface as `full`, and never more than the preview
      // allows on it. Falling back to `today` is fine: this customer holds
      // today.view, and Today legitimately shows the whole list.
      if (body.surface === "edge") {
        expect(body.full).toBe(false);
        expect(body.matches).toHaveLength(3);
      } else {
        expect(body.surface).toBe("today");
      }
    }
  });

  it("reports how many matches were withheld, without leaking them", async () => {
    const body = (await (await get(`${BASE}?surface=edge`)).json()) as {
      matches: unknown[];
      withheld?: number;
    };
    expect(body.withheld).toBe(4);
    expect(JSON.stringify(body)).not.toContain("event-4");
  });

  it("still refuses a caller with no session at all", async () => {
    state.denied = new Response(null, { status: 401 });
    expect((await get(`${BASE}?surface=edge`)).status).toBe(401);
  });

  it("asks the session gate for the surface's own entitlement", async () => {
    await get(`${BASE}?surface=edge`);
    expect(state.requestedEntitlement).toBe("edge.preview");
  });
});
