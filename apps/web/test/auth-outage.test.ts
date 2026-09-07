import { afterEach, describe, expect, it, vi } from "vitest";
import { translate } from "@velyq/ui";
import { resolveAuthError } from "../app/components/auth-error";
import { POST as signIn } from "../app/api/v1/auth/sign-in/route";
import { POST as signUp } from "../app/api/v1/auth/sign-up/route";

vi.mock("../app/locale", () => ({
  getLocale: async () => "en" as const,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/sign-in",
  useRouter: () => ({ refresh: vi.fn() }),
}));

const authEnvironment = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "VELYQ_APPLICATION_ORIGIN",
] as const;

const originalEnvironment = Object.fromEntries(
  authEnvironment.map((name) => [name, process.env[name]]),
) as Record<(typeof authEnvironment)[number], string | undefined>;

afterEach(() => {
  vi.restoreAllMocks();
  for (const name of authEnvironment) {
    const value = originalEnvironment[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function browserRequest(path: string, fields: Record<string, string>) {
  return new Request(`https://velyq.test${path}`, {
    method: "POST",
    headers: {
      accept: "text/html",
      origin: "https://velyq.test",
    },
    body: new URLSearchParams(fields),
  });
}

function jsonRequest(path: string, fields: Record<string, string>) {
  return new Request(`https://velyq.test${path}`, {
    method: "POST",
    headers: { origin: "https://velyq.test" },
    body: new URLSearchParams(fields),
  });
}

describe("authentication outage UX", () => {
  it("redirects browser sign-in to the unavailable state when auth is not configured", async () => {
    delete process.env["NEXT_PUBLIC_SUPABASE_URL"];
    delete process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];

    const response = await signIn(
      browserRequest("/api/v1/auth/sign-in", {
        email: "customer@example.com",
        password: "safe-password",
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://velyq.test/sign-in?error=unavailable",
    );
  });

  it("redirects browser sign-up to the unavailable state when auth is not configured", async () => {
    delete process.env["NEXT_PUBLIC_SUPABASE_URL"];
    delete process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];

    const response = await signUp(
      browserRequest("/api/v1/auth/sign-up", {
        email: "customer@example.com",
        password: "safe-password",
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://velyq.test/sign-up?error=unavailable",
    );
  });

  it("keeps invalid sign-in credentials distinct from provider unavailability", async () => {
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://supabase.test";
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = "publishable-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
    );

    const response = await signIn(
      browserRequest("/api/v1/auth/sign-in", {
        email: "customer@example.com",
        password: "wrong-password",
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://velyq.test/sign-in?error=invalid",
    );
  });

  it("redirects browser sign-in to unavailable when the provider is down", async () => {
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://supabase.test";
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = "publishable-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "provider_unavailable" }), {
        status: 503,
      }),
    );

    const response = await signIn(
      browserRequest("/api/v1/auth/sign-in", {
        email: "customer@example.com",
        password: "safe-password",
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://velyq.test/sign-in?error=unavailable",
    );
  });

  it("redirects browser sign-up to unavailable when the provider is down", async () => {
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://supabase.test";
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = "publishable-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "provider_unavailable" }), {
        status: 503,
      }),
    );

    const response = await signUp(
      browserRequest("/api/v1/auth/sign-up", {
        email: "customer@example.com",
        password: "safe-password",
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://velyq.test/sign-up?error=unavailable",
    );
  });

  it("redirects browser sign-in to unavailable when the provider request fails", async () => {
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://supabase.test";
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = "publishable-test";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    const response = await signIn(
      browserRequest("/api/v1/auth/sign-in", {
        email: "customer@example.com",
        password: "safe-password",
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://velyq.test/sign-in?error=unavailable",
    );
  });

  it("redirects browser sign-up to unavailable when the provider request fails", async () => {
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://supabase.test";
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = "publishable-test";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    const response = await signUp(
      browserRequest("/api/v1/auth/sign-up", {
        email: "customer@example.com",
        password: "safe-password",
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://velyq.test/sign-up?error=unavailable",
    );
  });

  it("redirects incomplete browser sign-in responses to unavailable", async () => {
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://supabase.test";
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = "publishable-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ access_token: "access-only" }), {
        status: 200,
      }),
    );

    const response = await signIn(
      browserRequest("/api/v1/auth/sign-in", {
        email: "customer@example.com",
        password: "safe-password",
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://velyq.test/sign-in?error=unavailable",
    );
  });

  it("redirects malformed browser sign-in responses to unavailable", async () => {
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://supabase.test";
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = "publishable-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not-json", { status: 200 }),
    );

    const response = await signIn(
      browserRequest("/api/v1/auth/sign-in", {
        email: "customer@example.com",
        password: "safe-password",
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://velyq.test/sign-in?error=unavailable",
    );
  });

  it.each([
    ["sign-in", signIn, "/api/v1/auth/sign-in"],
    ["sign-up", signUp, "/api/v1/auth/sign-up"],
  ] as const)(
    "redirects temporary %s throttling to unavailable",
    async (kind, handler, path) => {
      process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://supabase.test";
      process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = "publishable-test";
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ error: "temporarily_unavailable" }), {
          status: 429,
        }),
      );

      const response = await handler(
        browserRequest(path, {
          email: "customer@example.com",
          password: "safe-password",
        }),
      );

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        `https://velyq.test/${kind}?error=unavailable`,
      );
    },
  );

  it("preserves AUTH_NOT_CONFIGURED JSON responses", async () => {
    delete process.env["NEXT_PUBLIC_SUPABASE_URL"];
    delete process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];

    const signInResponse = await signIn(
      jsonRequest("/api/v1/auth/sign-in", {
        email: "customer@example.com",
        password: "safe-password",
      }),
    );
    const signUpResponse = await signUp(
      jsonRequest("/api/v1/auth/sign-up", {
        email: "customer@example.com",
        password: "safe-password",
      }),
    );

    expect(signInResponse.status).toBe(503);
    await expect(signInResponse.json()).resolves.toMatchObject({
      code: "AUTH_NOT_CONFIGURED",
      status: 503,
    });
    expect(signUpResponse.status).toBe(503);
    await expect(signUpResponse.json()).resolves.toMatchObject({
      code: "AUTH_NOT_CONFIGURED",
    });
  });

  it("preserves INVALID_CREDENTIALS JSON responses", async () => {
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://supabase.test";
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = "publishable-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
    );

    const response = await signIn(
      jsonRequest("/api/v1/auth/sign-in", {
        email: "customer@example.com",
        password: "wrong-password",
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_CREDENTIALS",
      status: 401,
    });
  });

  it("preserves AUTH_PROVIDER_RESPONSE_INVALID JSON responses", async () => {
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://supabase.test";
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = "publishable-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ access_token: "access-only" }), {
        status: 200,
      }),
    );

    const response = await signIn(
      jsonRequest("/api/v1/auth/sign-in", {
        email: "customer@example.com",
        password: "safe-password",
      }),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      code: "AUTH_PROVIDER_RESPONSE_INVALID",
      status: 502,
    });
  });

  it("maps malformed provider JSON to AUTH_PROVIDER_RESPONSE_INVALID", async () => {
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://supabase.test";
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = "publishable-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not-json", { status: 200 }),
    );

    const response = await signIn(
      jsonRequest("/api/v1/auth/sign-in", {
        email: "customer@example.com",
        password: "safe-password",
      }),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      code: "AUTH_PROVIDER_RESPONSE_INVALID",
      status: 502,
    });
  });

  it("preserves SIGN_UP_FAILED JSON responses", async () => {
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://supabase.test";
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = "publishable-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "signup_failed" }), { status: 400 }),
    );

    const response = await signUp(
      jsonRequest("/api/v1/auth/sign-up", {
        email: "customer@example.com",
        password: "safe-password",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "SIGN_UP_FAILED",
    });
  });

  /*
   * These two used to render the sign-in and sign-up pages with a
   * `searchParams` promise and assert the server-rendered banner. Those pages
   * are prerendered into static assets now — one file answers `/sign-in` and
   * `/sign-in?error=unavailable` alike — so the banner is decided in the
   * browser instead. The invariant is unchanged and is asserted where the
   * decision actually lives: an outage is never reported as a rejected
   * credential, and never marks the customer's input invalid.
   */
  it("treats a provider outage as unavailable, not as bad credentials", () => {
    const outage = resolveAuthError("unavailable");
    expect(outage.visible).toBe(true);
    expect(outage.unavailable).toBe(true);
    expect(outage.markInvalid).toBe(false);
  });

  it("treats a rejected credential as invalid input", () => {
    const rejected = resolveAuthError("invalid");
    expect(rejected.visible).toBe(true);
    expect(rejected.unavailable).toBe(false);
    expect(rejected.markInvalid).toBe(true);
  });

  it("shows nothing when there is no error at all", () => {
    const none = resolveAuthError(null);
    expect(none.visible).toBe(false);
    expect(none.markInvalid).toBe(false);
  });

  it("provides the approved action-specific unavailable copy in English and Greek", () => {
    expect(translate("authSignInUnavailable", "en")).toBe(
      "Sign-in is temporarily unavailable. This is not a problem with your details.",
    );
    expect(translate("authSignUpUnavailable", "en")).toBe(
      "Account creation is temporarily unavailable. Please try again shortly.",
    );
    expect(translate("authSignInUnavailable", "el")).toBe(
      "Η σύνδεση δεν είναι διαθέσιμη αυτή τη στιγμή. Δεν φταίνε τα στοιχεία σου.",
    );
    expect(translate("authSignUpUnavailable", "el")).toBe(
      "Η δημιουργία λογαριασμού δεν είναι διαθέσιμη αυτή τη στιγμή. Δοκίμασε ξανά σύντομα.",
    );
  });

  /*
   * The global brand names no single sport; a football page still does.
   *
   * This test previously pinned the opposite — it required "football market
   * intelligence" in the metadata, the footer and the sign-in copy. That was
   * right while VELYQ was football-only. Now that basketball is coming, brand
   * copy that names football would have to be rewritten for every sport
   * added, and would misdescribe the product in the meantime.
   *
   * The distinction is the thing worth asserting, so both halves are: the
   * global surfaces are sport-neutral, and the match surface keeps its sport.
   */
  it("keeps the global brand sport-neutral without stripping sport context", () => {
    for (const locale of ["en", "el"] as const) {
      for (const key of [
        "brandTagline",
        "metaTitle",
        "metaDescription",
        "footerRights",
        "authSignInBody",
      ] as const) {
        const copy = translate(key, locale).toLowerCase();
        expect(copy).not.toContain("football");
        expect(copy).not.toContain("ποδοσφαίρ");
        expect(copy).not.toContain("ποδόσφαιρ");
      }
    }

    expect(translate("metaDescription", "en")).toContain(
      "sports market intelligence",
    );
    expect(translate("footerRights", "en")).toBe("Sports market intelligence");

    /* Football pages keep saying football: the sport is context a reader
       needs, and removing it would make every match look sportless. */
    expect(translate("matchKicker", "en").toLowerCase()).toContain("football");
    expect(translate("matchKicker", "el").toLowerCase()).toContain("ποδόσφαιρ");

    expect(translate("termsBody1", "en")).toContain(
      "for information and research",
    );
  });

  /*
   * The substance of the compliance copy, asserted rather than the wording.
   *
   * Sanitising the product copy meant rewriting these sentences, and pinning
   * them verbatim only proves they have not been edited — it does not prove
   * the disclosures are still in them. Each clause below is a commitment
   * VELYQ has to keep making however the surrounding prose is phrased: no
   * advice, no guaranteed outcome, no bet placed on anyone's behalf, and a
   * probability that is never presented as a forecast.
   */
  it("keeps every compliance disclosure present in both languages", () => {
    for (const [locale, clauses] of [
      [
        "en",
        [
          "does not give financial advice",
          "does not guarantee any outcome",
          "does not place bets",
          "No probability estimate is a prediction of what will happen",
          "Never stake money you cannot afford to lose",
        ],
      ],
      [
        "el",
        [
          "δεν δίνει οικονομικές συμβουλές",
          "δεν εγγυάται κανένα αποτέλεσμα",
          "δεν τοποθετεί στοιχήματα",
          "δεν είναι πρόβλεψη του τι θα συμβεί",
          "Μην ποντάρεις ποτέ χρήματα που δεν αντέχεις να χάσεις",
        ],
      ],
    ] as const) {
      const notice = translate("homeNoticeBody", locale);
      for (const clause of clauses) expect(notice).toContain(clause);
    }

    expect(translate("responsibleUseBody1", "en")).toContain(
      "not a betting system",
    );
    expect(translate("responsibleUseBody1", "el")).toContain(
      "δεν είναι σύστημα στοιχηματισμού",
    );
  });
});
