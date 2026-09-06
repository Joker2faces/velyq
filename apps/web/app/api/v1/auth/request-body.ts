/**
 * Reads the fields of an auth request from either a browser form post or a
 * JSON API call.
 *
 * These routes have always served both — the `browserForm` branch in each one
 * exists precisely so a non-HTML client gets a problem document instead of a
 * redirect. But the body was read with `request.formData()` unconditionally,
 * which throws a TypeError for `application/json`, so every JSON caller
 * received a bare 500 and no problem document. Parsing by content-type fixes
 * that, and a malformed body becomes a considered 400 rather than a crash.
 *
 * Returns `null` when the body cannot be parsed at all, which callers report as
 * INVALID_REQUEST. Values are narrowed to strings so callers keep their
 * existing `typeof value !== "string"` validation unchanged.
 */
export type AuthRequestFields = {
  get(name: string): string | null;
};

export async function readAuthRequestFields(
  request: Request,
): Promise<AuthRequestFields | null> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    let parsed: unknown;
    try {
      parsed = await request.json();
    } catch {
      return null;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return null;
    const fields = parsed as Record<string, unknown>;
    return {
      get: (name) => {
        const value = fields[name];
        // Anything that is not a string is absent as far as callers are
        // concerned, so their existing validation rejects it as before.
        return typeof value === "string" ? value : null;
      },
    };
  }

  try {
    const form = await request.formData();
    return {
      get: (name) => {
        const value = form.get(name);
        return typeof value === "string" ? value : null;
      },
    };
  } catch {
    return null;
  }
}
