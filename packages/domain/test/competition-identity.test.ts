import { describe, expect, it } from "vitest";

import {
  competitionId,
  resolveCompetitionIdentity,
  type CompetitionIdentityBridgeRow,
} from "../src/index.js";

function id(uuid: string) {
  const result = competitionId(uuid);
  if (!result.ok) throw new Error("test fixture uuid must be valid");
  return result.value;
}

const SERIE_A = id("11111111-1111-4111-8111-111111111111");
const BRAZILIAN_SERIE_A = id("22222222-2222-4222-8222-222222222222");

const ITALIAN_ROW: CompetitionIdentityBridgeRow = {
  competitionId: SERIE_A,
  providerCode: "API_SPORTS",
  providerCompetitionId: "135",
  displayName: "Serie A",
  countryCode: "IT",
  mappingStatus: "CONFIRMED",
};

const BRAZILIAN_ROW: CompetitionIdentityBridgeRow = {
  competitionId: BRAZILIAN_SERIE_A,
  providerCode: "API_SPORTS",
  providerCompetitionId: "71",
  displayName: "Serie A",
  countryCode: "BR",
  mappingStatus: "CONFIRMED",
};

const BRIDGE = [ITALIAN_ROW, BRAZILIAN_ROW];

describe("resolveCompetitionIdentity", () => {
  /*
   * The exact regression a real production defect requires: Vitoria vs
   * Gremio (Brazilian Série A) was once mapped to ITA_SERIE_A because the
   * resolver matched on the display name "Serie A" alone. Both bridge rows
   * here share an identical name; only their provider competition id
   * distinguishes them, which is the only thing this resolver is allowed to
   * key on.
   */
  it("never resolves the Brazilian and Italian Série A to the same competition despite an identical name", () => {
    const italy = resolveCompetitionIdentity(
      {
        providerCode: "API_SPORTS",
        providerCompetitionId: "135",
        displayName: "Serie A",
        countryCode: "IT",
      },
      BRIDGE,
    );
    const brazil = resolveCompetitionIdentity(
      {
        providerCode: "API_SPORTS",
        providerCompetitionId: "71",
        displayName: "Serie A",
        countryCode: "BR",
      },
      BRIDGE,
    );

    expect(italy).toMatchObject({ ok: true, competitionId: SERIE_A });
    expect(brazil).toMatchObject({
      ok: true,
      competitionId: BRAZILIAN_SERIE_A,
    });
    expect(italy.ok && brazil.ok && italy.competitionId).not.toBe(
      brazil.ok && brazil.competitionId,
    );
  });

  it("maps two different providers, under two different external competition ids, onto the same internal competition without duplicating it", () => {
    /*
     * The property the bridge-table design exists for: one internal
     * competition, several providers each reporting it under their own
     * numbering. Neither row creates or requires a second catalog entry.
     */
    const secondProviderRow: CompetitionIdentityBridgeRow = {
      competitionId: SERIE_A,
      providerCode: "SOME_OTHER_PROVIDER",
      providerCompetitionId: "IT-SA-2026",
      displayName: "Serie A",
      countryCode: "IT",
      mappingStatus: "CONFIRMED",
    };
    const bridge = [ITALIAN_ROW, secondProviderRow];

    const fromApiSports = resolveCompetitionIdentity(
      {
        providerCode: "API_SPORTS",
        providerCompetitionId: "135",
        displayName: "Serie A",
        countryCode: "IT",
      },
      bridge,
    );
    const fromOtherProvider = resolveCompetitionIdentity(
      {
        providerCode: "SOME_OTHER_PROVIDER",
        providerCompetitionId: "IT-SA-2026",
        displayName: "Serie A",
        countryCode: "IT",
      },
      bridge,
    );

    expect(fromApiSports).toMatchObject({ ok: true, competitionId: SERIE_A });
    expect(fromOtherProvider).toMatchObject({
      ok: true,
      competitionId: SERIE_A,
    });
    expect(
      new Set(
        [fromApiSports, fromOtherProvider]
          .map((result) => result.ok && result.competitionId)
          .filter((value): value is typeof SERIE_A => value !== false),
      ).size,
    ).toBe(1);
  });

  it("never falls back to a name/country match when the provider competition id is unknown", () => {
    /*
     * A provider id VELYQ has never seen for this provider, but whose name
     * and country happen to match a real bridge row exactly. A resolver
     * that fell back to name+country here would reintroduce a version of
     * the exact bug this module exists to prevent.
     */
    const result = resolveCompetitionIdentity(
      {
        providerCode: "API_SPORTS",
        providerCompetitionId: "999999",
        displayName: "Serie A",
        countryCode: "IT",
      },
      BRIDGE,
    );

    expect(result).toEqual({ ok: false, reason: "UNRESOLVED_COMPETITION" });
  });

  it("never resolves a provider competition id observed under a different provider", () => {
    const result = resolveCompetitionIdentity(
      {
        providerCode: "SOME_OTHER_PROVIDER",
        providerCompetitionId: "135",
        displayName: "Serie A",
        countryCode: "IT",
      },
      BRIDGE,
    );

    expect(result).toEqual({ ok: false, reason: "UNRESOLVED_COMPETITION" });
  });

  it("fails closed rather than guessing when the bridge table itself has a duplicate provider identity", () => {
    const duplicated: CompetitionIdentityBridgeRow = {
      ...ITALIAN_ROW,
      competitionId: id("33333333-3333-4333-8333-333333333333"),
    };

    const result = resolveCompetitionIdentity(
      {
        providerCode: "API_SPORTS",
        providerCompetitionId: "135",
        displayName: "Serie A",
        countryCode: "IT",
      },
      [ITALIAN_ROW, duplicated],
    );

    expect(result).toEqual({
      ok: false,
      reason: "AMBIGUOUS_PROVIDER_IDENTITY",
    });
  });

  it("flags a mismatch without changing the resolved competition", () => {
    const result = resolveCompetitionIdentity(
      {
        providerCode: "API_SPORTS",
        providerCompetitionId: "135",
        // The provider suddenly reports a different country for the exact
        // same competition id -- worth an admin review flag, never a reason
        // to reject or redirect the match.
        displayName: "Serie A",
        countryCode: "SM",
      },
      BRIDGE,
    );

    expect(result).toMatchObject({
      ok: true,
      competitionId: SERIE_A,
      mismatch: true,
    });
  });

  it("fails closed on a bridge row still awaiting human confirmation", () => {
    const pending: CompetitionIdentityBridgeRow = {
      ...ITALIAN_ROW,
      mappingStatus: "PENDING_REVIEW",
    };

    const result = resolveCompetitionIdentity(
      {
        providerCode: "API_SPORTS",
        providerCompetitionId: "135",
        displayName: "Serie A",
        countryCode: "IT",
      },
      [pending],
    );

    expect(result).toEqual({ ok: false, reason: "MAPPING_PENDING_REVIEW" });
  });

  it("fails closed on a bridge row a human has rejected", () => {
    const rejected: CompetitionIdentityBridgeRow = {
      ...ITALIAN_ROW,
      mappingStatus: "REJECTED",
    };

    const result = resolveCompetitionIdentity(
      {
        providerCode: "API_SPORTS",
        providerCompetitionId: "135",
        displayName: "Serie A",
        countryCode: "IT",
      },
      [rejected],
    );

    expect(result).toEqual({ ok: false, reason: "MAPPING_REJECTED" });
  });
});
