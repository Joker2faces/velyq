import { NextResponse } from "next/server";
import { customerRedirectUrl, requestId } from "../../../auth";

export async function POST(request: Request) {
  const browserForm =
    request.headers.get("accept")?.includes("text/html") ?? false;
  const form = await request.formData();
  const email = form.get("email");
  const password = form.get("password");
  const browserError = () =>
    browserForm
      ? NextResponse.redirect(new URL("/sign-in?error=invalid", request.url))
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
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const publishableKey = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !publishableKey)
    return (
      browserError() ??
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
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: publishableKey, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  if (!response.ok) {
    if (browserForm)
      return NextResponse.redirect(
        new URL("/sign-in?error=invalid", request.url),
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
  const tokens = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!tokens.access_token || !tokens.refresh_token)
    return (
      browserError() ??
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
