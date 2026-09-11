import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pageDependencies = vi.hoisted(() => ({
  close: vi.fn(async () => undefined),
  listProviderIngestionRuns: vi.fn(),
}));

vi.mock("../app/admin-page.js", async () => {
  const { createElement } = await import("react");
  return {
    AdminGate: ({ title }: { title: string }) =>
      createElement("main", null, title),
    AdminShell: ({ children }: { children: ReactNode }) =>
      createElement("main", null, children),
    getAdminContext: async () => ({
      runtime: {
        close: pageDependencies.close,
        queries: {
          listProviderIngestionRuns: pageDependencies.listProviderIngestionRuns,
        },
      },
    }),
  };
});

vi.mock("../app/locale.js", () => ({ getLocale: async () => "el" }));

import ProviderIngestionRunsPage from "../app/provider-ingestion-runs/page.js";

const validCursor =
  "2026-09-03T10:00:00.000Z|00000000-0000-4000-8000-000000000005";

describe("live provider-ingestion HTML pagination boundary", () => {
  beforeEach(() => {
    pageDependencies.close.mockClear();
    pageDependencies.listProviderIngestionRuns.mockReset();
  });

  it("renders a translated recovery state for a malformed cursor without querying", async () => {
    pageDependencies.listProviderIngestionRuns.mockRejectedValue(
      new Error("database must not be queried"),
    );

    const page = await ProviderIngestionRunsPage({
      searchParams: Promise.resolve({ cursor: "not-a-keyset-cursor" }),
    });
    const html = renderToStaticMarkup(createElement(() => page));

    expect(pageDependencies.listProviderIngestionRuns).not.toHaveBeenCalled();
    expect(html).toContain("Μη έγκυρος σύνδεσμος σελίδας");
    expect(html).toContain("Νεότερες εκτελέσεις");
    expect(html).toContain('href="/provider-ingestion-runs"');
  });

  it("queries and renders the requested page for a valid keyset cursor", async () => {
    pageDependencies.listProviderIngestionRuns.mockImplementation(
      async (input: { limit: number; cursor: string | null }) => {
        if (input.limit !== 100 || input.cursor !== validCursor)
          throw new Error("wrong pagination input");
        return { items: [], nextCursor: null };
      },
    );

    const page = await ProviderIngestionRunsPage({
      searchParams: Promise.resolve({ cursor: validCursor }),
    });
    const html = renderToStaticMarkup(createElement(() => page));

    expect(pageDependencies.listProviderIngestionRuns).toHaveBeenCalledOnce();
    expect(html).toContain("Δεν καταγράφηκαν εκτελέσεις ζωντανής εισαγωγής");
    expect(html).toContain("Νεότερες εκτελέσεις");
    expect(html).not.toContain("Μη έγκυρος σύνδεσμος σελίδας");
  });
});
