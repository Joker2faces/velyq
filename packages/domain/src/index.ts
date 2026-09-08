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
