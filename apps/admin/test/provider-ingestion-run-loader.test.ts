import { describe, expect, it } from "vitest";

import { loadProviderIngestionRun } from "../app/provider-ingestion-run-loader.js";

describe("provider ingestion detail loader", () => {
  it("turns a malformed run id into a genuine Next 404", async () => {
    await expect(
      loadProviderIngestionRun("not-a-uuid", async () => {
        throw new Error("query must not run");
      }),
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });

  it("turns database NOT_FOUND into a genuine Next 404", async () => {
    await expect(
      loadProviderIngestionRun(
        "00000000-0000-4000-8000-000000000005",
        async () => {
          throw new Error("NOT_FOUND");
        },
      ),
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });

  it("preserves dependency failures for the route error boundary", async () => {
    const dependencyError = new Error("QUERY_FAILED");

    await expect(
      loadProviderIngestionRun(
        "00000000-0000-4000-8000-000000000005",
        async () => {
          throw dependencyError;
        },
      ),
    ).rejects.toBe(dependencyError);
  });
});
