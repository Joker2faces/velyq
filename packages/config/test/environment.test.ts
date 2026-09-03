import { describe, expect, it } from "vitest";

import {
  parsePublicEnvironment,
  parseWorkerEnvironment,
} from "../src/index.js";

describe("public environment parsing", () => {
  it("rejects a server secret presented in the public environment", () => {
    expect(() =>
      parsePublicEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.example.test",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable-key",
        SUPABASE_SERVICE_ROLE_KEY: "must-not-be-public",
      }),
    ).toThrow(/not allowed/i);
  });

  it("accepts only the documented public Supabase values", () => {
    expect(
      parsePublicEnvironment({
        NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.example.test",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable-key",
      }),
    ).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.example.test",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-publishable-key",
    });
  });
});

describe("worker environment parsing", () => {
  it("rejects a worker configuration without its server-only database URL", () => {
    expect(() =>
      parseWorkerEnvironment({
        VELYQ_PROVIDER_MODE: "synthetic",
      }),
    ).toThrow(/VELYQ_DATABASE_URL/i);
  });
});
