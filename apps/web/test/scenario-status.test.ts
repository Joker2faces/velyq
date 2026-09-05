import { describe, expect, it } from "vitest";
import { ScenarioStatus } from "../app/scenario-status.js";

describe("scenario status component contract", () => {
  it("exposes the scenario state while displaying its human label", () => {
    const element = ScenarioStatus({
      scenario: {
        id: "74000000-0000-4000-8000-000000000004",
        state: "STRONG_EDGE",
        label: "Strong edge",
      },
    });

    expect(element.props["data-scenario-state"]).toBe("STRONG_EDGE");
    expect((element.props as { children?: unknown }).children).toBe(
      "Strong edge",
    );
  });
});
