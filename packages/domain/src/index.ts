declare const eventIdBrand: unique symbol;
declare const teamIdBrand: unique symbol;
declare const playerIdBrand: unique symbol;

export type EventId = string & { readonly [eventIdBrand]: "EventId" };
export type TeamId = string & { readonly [teamIdBrand]: "TeamId" };
export type PlayerId = string & { readonly [playerIdBrand]: "PlayerId" };

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
