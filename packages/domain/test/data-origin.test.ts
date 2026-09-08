import { describe, expect, it } from "vitest";

import {
  dataOriginToSyntheticColumn,
  requiresProviderProvenance,
  syntheticColumnToDataOrigin,
} from "../src/index.js";

describe("data origin", () => {
  it("round-trips through the storage boolean in both directions", () => {
    expect(dataOriginToSyntheticColumn("SYNTHETIC_DEMO")).toBe(true);
    expect(dataOriginToSyntheticColumn("LIVE")).toBe(false);
    expect(syntheticColumnToDataOrigin(true)).toBe("SYNTHETIC_DEMO");
    expect(syntheticColumnToDataOrigin(false)).toBe("LIVE");
  });

  it("requires provider provenance only for LIVE, never for SYNTHETIC_DEMO", () => {
    /*
     * The invariant this whole module exists to state explicitly: a row
     * never becomes LIVE merely because a boolean happens to be false.
     * Nothing here defaults an unstated origin to LIVE -- the function has
     * no fallback branch, only the two known values.
     */
    expect(requiresProviderProvenance("LIVE")).toBe(true);
    expect(requiresProviderProvenance("SYNTHETIC_DEMO")).toBe(false);
  });
});
