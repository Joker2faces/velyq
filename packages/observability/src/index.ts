export type StructuredLog = Readonly<{
  level: "info" | "warn" | "error";
  event: string;
  correlationId: string;
  metadata?: Readonly<Record<string, string | number | boolean>>;
}>;
const SECRET_KEY =
  /authorization|cookie|password|secret|token|service.?role|database.?url/i;
export function redactLogMetadata(metadata: Readonly<Record<string, unknown>>) {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      SECRET_KEY.test(key) ? "[REDACTED]" : String(value),
    ]),
  );
}
export function createStructuredLog(input: StructuredLog): StructuredLog {
  return Object.freeze({
    ...input,
    ...(input.metadata ? { metadata: redactLogMetadata(input.metadata) } : {}),
  });
}
