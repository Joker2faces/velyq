import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const form = await request.formData();
  const email = form.get("email");
  const password = form.get("password");
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email ||
    !password
  ) {
    return NextResponse.json(
      {
        type: "https://velyq.dev/problems/invalid-request",
        title: "Invalid sign-in request",
        status: 400,
        code: "INVALID_REQUEST",
        requestId: crypto.randomUUID(),
      },
      { status: 400 },
    );
  }
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const publishableKey = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !publishableKey)
    return NextResponse.json(
      {
        type: "https://velyq.dev/problems/not-configured",
        title: "Authentication is not configured",
        status: 503,
        code: "AUTH_NOT_CONFIGURED",
        requestId: crypto.randomUUID(),
      },
      { status: 503 },
    );
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: publishableKey, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  if (!response.ok)
    return NextResponse.json(
      {
        type: "https://velyq.dev/problems/unauthorized",
        title: "Sign-in failed",
        status: 401,
        code: "INVALID_CREDENTIALS",
        requestId: crypto.randomUUID(),
      },
      { status: 401 },
    );
  const tokens = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!tokens.access_token || !tokens.refresh_token)
    return NextResponse.json(
      {
        type: "https://velyq.dev/problems/auth-provider",
        title: "Authentication provider response was incomplete",
        status: 502,
        code: "AUTH_PROVIDER_RESPONSE_INVALID",
        requestId: crypto.randomUUID(),
      },
      { status: 502 },
    );
  const next = NextResponse.redirect(new URL("/today", request.url));
  next.cookies.set("velyq_access_token", tokens.access_token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: tokens.expires_in ?? 3600,
  });
  next.cookies.set("velyq_refresh_token", tokens.refresh_token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return next;
}
