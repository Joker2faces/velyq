import type { TeamAliasLookup } from "@velyq/domain";

/**
 * Verified provider-name aliases, scoped to `catalog.competitions.code`.
 *
 * An unscoped alias table is how a Spanish club's short name starts
 * resolving a Portuguese one, so every entry below is looked up only within
 * the competition it was verified for. This list is deliberately small and
 * hand-checked, growing one verified entry at a time -- an unlisted
 * disagreement between a provider's name and VELYQ's catalog is quarantined
 * by `resolveTeamIdentity` (`@velyq/domain`), never guessed at.
 */
export const VERIFIED_TEAM_ALIASES: readonly Readonly<{
  competitionCode: string;
  /** The name as API-Sports spells it. */
  providerName: string;
  /** The normalized team key the alias resolves to. */
  teamKey: string;
}>[] = Object.freeze([
  {
    competitionCode: "NLD_EREDIVISIE",
    providerName: "NEC Nijmegen",
    teamKey: "nijmegen",
  },
]);

/**
 * Builds the alias lookup `resolveTeamIdentity` expects for one competition.
 */
export function teamAliasLookupFor(competitionCode: string): TeamAliasLookup {
  return new Map(
    VERIFIED_TEAM_ALIASES.filter(
      (entry) => entry.competitionCode === competitionCode,
    ).map((entry) => [entry.providerName, entry.teamKey]),
  );
}
