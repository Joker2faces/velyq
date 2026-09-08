import { createHash } from "node:crypto";

declare const eventIdBrand: unique symbol;
declare const teamIdBrand: unique symbol;
declare const playerIdBrand: unique symbol;
declare const competitionIdBrand: unique symbol;

export type EventId = string & { readonly [eventIdBrand]: "EventId" };
export type TeamId = string & { readonly [teamIdBrand]: "TeamId" };
export type PlayerId = string & { readonly [playerIdBrand]: "PlayerId" };
export type CompetitionId = string & {
  readonly [competitionIdBrand]: "CompetitionId";
};

export type IdentifierFailure = Readonly<{
  readonly ok: false;
  readonly error: Readonly<{
    readonly code: "INVALID_IDENTIFIER";
    readonly message: string;
  }>;
}>;

export type IdentifierSuccess<T> = Readonly<{
  readonly ok: true;
  readonly value: T;
}>;
export type IdentifierResult<T> = IdentifierSuccess<T> | IdentifierFailure;

const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function identifier<T>(input: unknown, kind: string): IdentifierResult<T> {
  if (typeof input !== "string" || !canonicalUuidPattern.test(input)) {
    return Object.freeze({
      ok: false,
      error: Object.freeze({
        code: "INVALID_IDENTIFIER" as const,
        message: `${kind} identifiers must use canonical UUID syntax.`,
      }),
    });
  }

  return Object.freeze({ ok: true, value: input.toLowerCase() as T });
}

export function eventId(input: unknown): IdentifierResult<EventId> {
  return identifier<EventId>(input, "Event");
}

export function teamId(input: unknown): IdentifierResult<TeamId> {
  return identifier<TeamId>(input, "Team");
}

export function playerId(input: unknown): IdentifierResult<PlayerId> {
  return identifier<PlayerId>(input, "Player");
}

export function competitionId(input: unknown): IdentifierResult<CompetitionId> {
  return identifier<CompetitionId>(input, "Competition");
}

/**
 * Resolves a provider's competition reference to VELYQ's internal
 * competition identity through the `catalog.competition_identities` bridge
 * table -- never through `catalog.competitions` itself.
 *
 * A real production defect mapped Brazil's Série A to `ITA_SERIE_A` because
 * the resolver keyed on competition *name* alone -- "Serie A" exists in both
 * countries. The fix is not "also check the country": name and country are
 * never allowed to be the key at all. The only thing this function matches
 * on is `(providerCode, providerCompetitionId)` -- the pair a provider
 * itself treats as a stable identity for the competition. Country and
 * display name are still carried on the observation and compared against
 * the matched bridge row, but only to produce a `mismatch` flag for admin
 * review; they never change which row -- or whether any row -- is selected.
 *
 * The bridge table is deliberately separate from `catalog.competitions`
 * rather than columns on it, for the same reason `catalog.event_identities`
 * is separate from `catalog.events`: one competition can be reported by
 * several providers under several different source keys, and a
 * provider-specific column on the core catalog row cannot represent more
 * than one provider's mapping at a time.
 *
 * A bridge row also carries a review lifecycle, because a newly-discovered
 * provider identity is not the same as a *confirmed* one: `PENDING_REVIEW`
 * fails closed exactly like an unknown identity (an unverified guess must
 * never resolve), `REJECTED` fails closed with its own reason (a human
 * looked at this pairing and said no), and only `CONFIRMED` resolves.
 */
export type CompetitionMappingStatus =
  "CONFIRMED" | "PENDING_REVIEW" | "REJECTED";

export type ProviderCompetitionObservation = Readonly<{
  providerCode: string;
  providerCompetitionId: string;
  displayName: string;
  countryCode: string | null;
}>;

export type CompetitionIdentityBridgeRow = Readonly<{
  competitionId: CompetitionId;
  providerCode: string;
  providerCompetitionId: string;
  displayName: string;
  countryCode: string | null;
  mappingStatus: CompetitionMappingStatus;
}>;

export type CompetitionResolution =
  | Readonly<{
      ok: true;
      competitionId: CompetitionId;
      matchedBy: "PROVIDER_IDENTITY";
      /** True when the observation's own name/country disagrees with the
          matched bridge row's recorded values -- never gates the match,
          only flags it for admin review. */
      mismatch: boolean;
    }>
  | Readonly<{
      ok: false;
      reason:
        | "UNRESOLVED_COMPETITION"
        | "AMBIGUOUS_PROVIDER_IDENTITY"
        | "MAPPING_PENDING_REVIEW"
        | "MAPPING_REJECTED";
    }>;

export function resolveCompetitionIdentity(
  observation: ProviderCompetitionObservation,
  knownIdentities: readonly CompetitionIdentityBridgeRow[],
): CompetitionResolution {
  const matches = knownIdentities.filter(
    (row) =>
      row.providerCode === observation.providerCode &&
      row.providerCompetitionId === observation.providerCompetitionId,
  );

  if (matches.length === 0) {
    return Object.freeze({ ok: false, reason: "UNRESOLVED_COMPETITION" });
  }
  if (matches.length > 1) {
    return Object.freeze({ ok: false, reason: "AMBIGUOUS_PROVIDER_IDENTITY" });
  }

  const row = matches[0]!;
  if (row.mappingStatus === "PENDING_REVIEW") {
    return Object.freeze({ ok: false, reason: "MAPPING_PENDING_REVIEW" });
  }
  if (row.mappingStatus === "REJECTED") {
    return Object.freeze({ ok: false, reason: "MAPPING_REJECTED" });
  }

  const mismatch =
    row.displayName !== observation.displayName ||
    row.countryCode !== observation.countryCode;

  return Object.freeze({
    ok: true,
    competitionId: row.competitionId,
    matchedBy: "PROVIDER_IDENTITY",
    mismatch,
  });
}

/**
 * Resolves a provider's team name onto the identity a competition's model
 * actually covers.
 *
 * A real production defect: a verified alias table existed (the corpus calls
 * a club "Nijmegen", API-Sports calls it "NEC Nijmegen"), but the prediction
 * cycle normalized the provider's name and checked model membership directly
 * -- it never consulted the alias table at all. Every aliased club was
 * quarantined as `TEAM_NOT_IN_MODEL`, which reads exactly like a newly
 * promoted side with no ratings and is a completely different situation.
 *
 * `TEAM_NOT_IN_MODEL` now means precisely that: the name resolved -- directly
 * or through a verified alias -- but the *resolved* identity has no model
 * coverage in this competition. `UNRESOLVED_TEAM` means the name matched
 * neither a known team nor a verified alias; nothing here guesses at that
 * case. Fuzzy string similarity is deliberately absent: "Manchester United"
 * and "Manchester City" are two edits apart, and a wrong merge does not
 * throw, it silently trains one team's rating on another team's results.
 */
export type TeamAliasLookup = ReadonlyMap<string, string>;

export type TeamResolution =
  | Readonly<{
      status: "PROVIDER_IDENTITY_MATCH" | "VERIFIED_ALIAS_MATCH";
      teamKey: string;
    }>
  | Readonly<{
      status: "TEAM_NOT_IN_MODEL";
      teamKey: string;
      /** Always `VERIFIED_ALIAS_MATCH`: a direct name match implies model
          coverage by construction, so this status can only be reached
          through the alias table. */
      via: "VERIFIED_ALIAS_MATCH";
    }>
  | Readonly<{ status: "UNRESOLVED_TEAM" }>;

export function resolveTeamIdentity(input: {
  sourceName: string;
  normalizedName: string;
  /** Scoped to a single competition by the caller -- an unscoped alias index
      is how a Spanish club's short name starts resolving a Portuguese one. */
  aliasLookup: TeamAliasLookup;
  knownTeamKeys: ReadonlySet<string>;
}): TeamResolution {
  if (input.knownTeamKeys.has(input.normalizedName)) {
    return Object.freeze({
      status: "PROVIDER_IDENTITY_MATCH",
      teamKey: input.normalizedName,
    });
  }

  const aliased = input.aliasLookup.get(input.sourceName);
  if (aliased !== undefined) {
    return input.knownTeamKeys.has(aliased)
      ? Object.freeze({ status: "VERIFIED_ALIAS_MATCH", teamKey: aliased })
      : Object.freeze({
          status: "TEAM_NOT_IN_MODEL",
          teamKey: aliased,
          via: "VERIFIED_ALIAS_MATCH",
        });
  }

  return Object.freeze({ status: "UNRESOLVED_TEAM" });
}

/**
 * Derives a stable internal event identity from a provider's own fixture
 * reference -- never from team names and a kickoff time.
 *
 * Two fixtures for the same two teams are not rare -- a league and a cup can
 * pair the same clubs in the same week -- so "teams + kickoff" is not a
 * unique key even before accounting for a postponement changing the kickoff
 * on file. A provider's own fixture id is the one thing the provider itself
 * treats as that fixture's stable identity, so it is the only input this
 * function accepts.
 *
 * The id is deterministic: the same `(providerCode, providerFixtureId)` pair
 * always derives the same `EventId`, which is what makes ingesting the same
 * fixture twice idempotent by construction -- an upsert against this id needs
 * no prior lookup to detect the duplicate. `providerCode` is part of the seed
 * so that two providers who happen to reuse the same numeric id space can
 * never collide.
 */
export function deterministicEventId(
  providerCode: string,
  providerFixtureId: string,
): EventId {
  const digest = createHash("sha256")
    .update(`event:${providerCode}:${providerFixtureId}`)
    .digest("hex");
  const uuid =
    `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`.toLowerCase();
  const checked = eventId(uuid);
  if (!checked.ok) {
    /* Unreachable: the construction above always yields canonical UUID
       syntax. Guarded rather than asserted so a future change to either
       function is caught by a type error, not a silently wrong id. */
    throw new Error("deterministicEventId produced non-canonical UUID syntax");
  }
  return checked.value;
}
