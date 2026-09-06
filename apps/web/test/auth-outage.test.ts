import { afterEach, describe, expect, it, vi } from "vitest";
import { translate } from "@velyq/ui";
import { POST as signIn } from "../app/api/v1/auth/sign-in/route";
import { POST as signUp } from "../app/api/v1/auth/sign-up/route";

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

  it("keeps compliance terms unchanged while applying football-specific product copy", () => {
    expect(translate("metaDescription", "en")).toContain(
      "football market intelligence",
    );
    expect(translate("footerRights", "en")).toBe(
      "AI football market intelligence",
    );
    expect(translate("authSignInBody", "en")).toBe(
      "Sign in to your football intelligence workspace.",
    );
    expect(translate("termsBody1", "en")).toBe(
      "VELYQ provides sports market intelligence for information and research. Phase 1 uses synthetic data and experimental models.",
    );
  });
});
