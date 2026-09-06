import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { translate } from "@velyq/ui";
import { POST as signIn } from "../app/api/v1/auth/sign-in/route";
import { POST as signUp } from "../app/api/v1/auth/sign-up/route";
import SignIn from "../app/sign-in/page";
import SignUp from "../app/sign-up/page";

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

function inputMarkup(html: string, name: string) {
  return html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0] ?? "";
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
      process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] =
        "publishable-test";
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

  it("renders sign-in unavailability without marking credentials invalid", async () => {
    const html = renderToStaticMarkup(
      await SignIn({
        searchParams: Promise.resolve({ error: "unavailable" }),
      }),
    );

    expect(html).toContain(
      "Sign-in is temporarily unavailable. This is not a problem with your details.",
    );
    expect(inputMarkup(html, "email")).not.toContain("aria-invalid");
    expect(inputMarkup(html, "password")).not.toContain("aria-invalid");
    expect(inputMarkup(html, "email")).toContain(
      'aria-describedby="sign-in-error"',
    );
    expect(inputMarkup(html, "password")).toContain(
      'aria-describedby="sign-in-error"',
    );
  });

  it("renders sign-up unavailability without marking credentials invalid", async () => {
    const html = renderToStaticMarkup(
      await SignUp({
        searchParams: Promise.resolve({ error: "unavailable" }),
      }),
    );

    expect(html).toContain(
      "Account creation is temporarily unavailable. Please try again shortly.",
    );
    expect(inputMarkup(html, "email")).not.toContain("aria-invalid");
    expect(inputMarkup(html, "password")).not.toContain("aria-invalid");
    expect(inputMarkup(html, "email")).toContain(
      'aria-describedby="sign-up-error"',
    );
    expect(inputMarkup(html, "password")).toMatch(
      /aria-describedby="[^"]*sign-up-error[^"]*"/,
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
