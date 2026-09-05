import { describe, expect, it, vi } from "vitest";
import { POST as forgotPassword } from "../../apps/web/app/api/v1/auth/forgot-password/route";
import { POST as signUp } from "../../apps/web/app/api/v1/auth/sign-up/route";

describe("public authentication routes", () => {
  it("provisions signup through Supabase without accepting role metadata", async () => {
    const previousUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
    const previousKey = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
    const previousOrigin = process.env["NEXT_PUBLIC_APP_URL"];
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://supabase.test";
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = "publishable-test";
    process.env["NEXT_PUBLIC_APP_URL"] = "https://velyq.test";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ user: { id: "user-1" } }), {
          status: 200,
        }),
      );
    try {
      const form = new FormData();
      form.set("email", "customer@example.com");
      form.set("password", "safe-password");
      form.set("role", "ADMIN");
      form.set("isAdmin", "true");
      const response = await signUp(
        new Request("https://velyq.test/api/v1/auth/sign-up", {
          method: "POST",
          body: form,
        }),
      );
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "https://velyq.test/sign-in?registered=1",
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "https://supabase.test/auth/v1/signup",
        expect.objectContaining({
          body: JSON.stringify({
            email: "customer@example.com",
            password: "safe-password",
          }),
        }),
      );
      expect(fetchMock.mock.calls[0]?.[1]?.body).not.toContain("ADMIN");
    } finally {
      fetchMock.mockRestore();
      for (const [name, value] of [
        ["NEXT_PUBLIC_SUPABASE_URL", previousUrl],
        ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", previousKey],
        ["NEXT_PUBLIC_APP_URL", previousOrigin],
      ] as const) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it("validates signup input before contacting Supabase", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const form = new FormData();
    form.set("email", "customer@example.com");
    form.set("password", "short");
    const response = await signUp(
      new Request("https://velyq.test/api/v1/auth/sign-up", {
        method: "POST",
        body: form,
      }),
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("keeps password recovery responses generic", async () => {
    const previousUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
    const previousKey = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
    const previousOrigin = process.env["NEXT_PUBLIC_APP_URL"];
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://supabase.test";
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = "publishable-test";
    process.env["NEXT_PUBLIC_APP_URL"] = "https://velyq.test";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 404 }));
    try {
      const form = new FormData();
      form.set("email", "unknown@example.com");
      const response = await forgotPassword(
        new Request("https://velyq.test/api/v1/auth/forgot-password", {
          method: "POST",
          body: form,
        }),
      );
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "https://velyq.test/sign-in?recovery=sent",
      );
    } finally {
      fetchMock.mockRestore();
      for (const [name, value] of [
        ["NEXT_PUBLIC_SUPABASE_URL", previousUrl],
        ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", previousKey],
        ["NEXT_PUBLIC_APP_URL", previousOrigin],
      ] as const) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
});
