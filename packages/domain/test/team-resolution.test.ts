import { describe, expect, it } from "vitest";

import { resolveTeamIdentity, type TeamAliasLookup } from "../src/index.js";

/*
 * A real production defect: the corpus calls a club "Nijmegen", API-Sports
 * calls it "NEC Nijmegen", and a verified alias existed for exactly this --
 * but the prediction cycle normalized the provider's name and checked model
 * membership directly, bypassing the alias table entirely. Every aliased
 * club was quarantined as TEAM_NOT_IN_MODEL, indistinguishable from a truly
 * unmodeled, newly promoted side.
 */
const NIJMEGEN_ALIASES: TeamAliasLookup = new Map([
  ["NEC Nijmegen", "nijmegen"],
]);

describe("resolveTeamIdentity", () => {
  it("resolves a verified alias to a team the model covers", () => {
    const result = resolveTeamIdentity({
      sourceName: "NEC Nijmegen",
      normalizedName: "nec-nijmegen",
      aliasLookup: NIJMEGEN_ALIASES,
      knownTeamKeys: new Set(["nijmegen", "psv-eindhoven"]),
    });

    expect(result).toEqual({
      status: "VERIFIED_ALIAS_MATCH",
      teamKey: "nijmegen",
    });
  });

  it("resolves a name the provider spells exactly like the model without needing the alias table", () => {
    const result = resolveTeamIdentity({
      sourceName: "PSV Eindhoven",
      normalizedName: "psv-eindhoven",
      aliasLookup: NIJMEGEN_ALIASES,
      knownTeamKeys: new Set(["nijmegen", "psv-eindhoven"]),
    });

    expect(result).toEqual({
      status: "PROVIDER_IDENTITY_MATCH",
      teamKey: "psv-eindhoven",
    });
  });

  it("distinguishes a verified alias to a team with no model coverage from a genuinely unresolved name", () => {
    /*
     * The exact distinction the production defect erased: "Nijmegen" is a
     * real, verified alias, but the model this competition trained does not
     * cover that team this season (e.g. newly promoted). This is not the
     * same situation as a name nobody has ever heard of, and reporting it
     * that way hides a real data-coverage gap behind a generic label.
     */
    const result = resolveTeamIdentity({
      sourceName: "NEC Nijmegen",
      normalizedName: "nec-nijmegen",
      aliasLookup: NIJMEGEN_ALIASES,
      knownTeamKeys: new Set(["psv-eindhoven"]),
    });

    expect(result).toEqual({
      status: "TEAM_NOT_IN_MODEL",
      teamKey: "nijmegen",
      via: "VERIFIED_ALIAS_MATCH",
    });
  });

  it("never guesses at a name with no exact match and no verified alias", () => {
    const result = resolveTeamIdentity({
      sourceName: "Some Reserve Side FC",
      normalizedName: "some-reserve-side-fc",
      aliasLookup: NIJMEGEN_ALIASES,
      knownTeamKeys: new Set(["nijmegen", "psv-eindhoven"]),
    });

    expect(result).toEqual({ status: "UNRESOLVED_TEAM" });
  });

  it("never lets an alias table entry for a different competition leak into this resolution", () => {
    /*
     * The alias lookup passed in is exactly what the caller scoped to this
     * competition -- this module has no global alias table to accidentally
     * consult. Passing an empty lookup (as a caller resolving a different
     * competition would) must behave identically to there being no alias at
     * all for this name.
     */
    const result = resolveTeamIdentity({
      sourceName: "NEC Nijmegen",
      normalizedName: "nec-nijmegen",
      aliasLookup: new Map(),
      knownTeamKeys: new Set(["nijmegen"]),
    });

    expect(result).toEqual({ status: "UNRESOLVED_TEAM" });
  });
});
