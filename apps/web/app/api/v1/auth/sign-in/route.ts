import { NextResponse } from "next/server";
import { hasTrustedRequestOrigin } from "@velyq/auth";
import { customerRedirectUrl, requestId } from "../../../auth";
import { readAuthRequestFields } from "../request-body";
import { rateLimitedAuthResponse } from "../../../../rate-limit";

export async function POST(request: Request) {
  const browserForm =
    request.headers.get("accept")?.includes("text/html") ?? false;
  /*
   * Reads a browser form post or a JSON body. An unparseable body
   * yields an empty field set, so the validation just below reports
   * INVALID_REQUEST exactly as it does for a missing field — rather
   * than throwing, which is what `request.formData()` did to every
   * JSON caller.
   */
  const form = (await readAuthRequestFields(request)) ?? {
    get: () => null,
  };
  const email = form.get("email");
  const password = form.get("password");
  const browserError = () =>
    browserForm
      ? NextResponse.redirect(new URL("/sign-in?error=invalid", request.url))
      : null;
  const browserUnavailable = () =>
    browserForm
      ? NextResponse.redirect(
          new URL("/sign-in?error=unavailable", request.url),
        )
      : null;
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email ||
    !password
  ) {
    return (
      browserError() ??
      NextResponse.json(
        {
          type: "https://velyq.dev/problems/invalid-request",
          title: "Invalid sign-in request",
          status: 400,
          code: "INVALID_REQUEST",
          requestId: requestId(request),
        },
        { status: 400 },
      )
    );
  }
  if (
    !hasTrustedRequestOrigin(
      request.headers.get("origin"),
      trustedOrigin(request),
    )
  )
    return NextResponse.json(
      {
        type: "https://velyq.dev/problems/csrf-rejected",
        title: "Cross-site sign-in request rejected",
        status: 403,
        code: "CSRF_REJECTED",
        requestId: requestId(request),
      },
      { status: 403 },
    );
  /*
   * Placed after body/CSRF validation (so a malformed or cross-site request
   * doesn't consume budget) and before the Supabase call it exists to
   * protect: this is a credential-guessing target, and every attempt reaches
   * the auth provider unless this stops it first.
   */
  const limited = await rateLimitedAuthResponse(request, "sign-in", null);
  if (limited) return limited;
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const publishableKey = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !publishableKey)
    return (
      browserUnavailable() ??
      NextResponse.json(
        {
          type: "https://velyq.dev/problems/not-configured",
          title: "Authentication is not configured",
          status: 503,
          code: "AUTH_NOT_CONFIGURED",
          requestId: requestId(request),
        },
        { status: 503 },
      )
    );
  let response: Response;
  try {
    response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: publishableKey, "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
  } catch {
    return (
      browserUnavailable() ??
      NextResponse.json(
        {
          type: "https://velyq.dev/problems/auth-provider",
          title: "Authentication provider is unavailable",
          status: 503,
          code: "AUTH_PROVIDER_UNAVAILABLE",
          requestId: requestId(request),
        },
        { status: 503 },
      )
    );
  }
  if (!response.ok) {
    if (browserForm)
      return NextResponse.redirect(
        new URL(
          isTemporaryProviderFailure(response.status)
            ? "/sign-in?error=unavailable"
            : "/sign-in?error=invalid",
          request.url,
        ),
      );
    return (
      browserError() ??
      NextResponse.json(
        {
          type: "https://velyq.dev/problems/unauthorized",
          title: "Sign-in failed",
          status: 401,
          code: "INVALID_CREDENTIALS",
          requestId: requestId(request),
        },
        { status: 401 },
      )
    );
  }
  let tokens: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  } | null;
  try {
    const body: unknown = await response.json();
    tokens = typeof body === "object" && body !== null ? body : null;
  } catch {
    tokens = null;
  }
  if (!tokens?.access_token || !tokens.refresh_token)
    return (
      browserUnavailable() ??
      NextResponse.json(
        {
          type: "https://velyq.dev/problems/auth-provider",
          title: "Authentication provider response was incomplete",
          status: 502,
          code: "AUTH_PROVIDER_RESPONSE_INVALID",
          requestId: requestId(request),
        },
        { status: 502 },
      )
    );
  const redirect = customerRedirectUrl(request, "/today");
  if (!redirect)
    return NextResponse.json(
      {
        type: "https://velyq.dev/problems/not-configured",
        title: "Application origin is not configured",
        status: 503,
        code: "APPLICATION_ORIGIN_NOT_CONFIGURED",
        requestId: requestId(request),
      },
      { status: 503 },
    );
  const next = NextResponse.redirect(redirect);
  next.cookies.set("velyq_access_token", tokens.access_token, {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    path: "/",
    maxAge: tokens.expires_in ?? 3600,
  });
  next.cookies.set("velyq_refresh_token", tokens.refresh_token, {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return next;
}

function isTemporaryProviderFailure(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function trustedOrigin(request: Request) {
  try {
    return new URL(process.env["VELYQ_APPLICATION_ORIGIN"] ?? request.url)
      .origin;
  } catch {
    return "";
  }
}
