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

function identifier<T>(input: unknown, kind: string): IdentifierResult<T> {
  if (typeof input !== "string" || input.trim().length === 0) {
    return Object.freeze({
      ok: false,
      error: Object.freeze({
        code: "INVALID_IDENTIFIER" as const,
        message: `${kind} identifiers must be non-empty strings.`,
      }),
    });
  }

  return Object.freeze({ ok: true, value: input as T });
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
