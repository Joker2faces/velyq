import { NextResponse } from "next/server";
import { adminRedirectUrl, adminRequestId } from "../../../../admin-api";

export async function POST(request: Request) {
  const form = await request.formData();
  const email = form.get("email");
  const password = form.get("password");
  const requestId = adminRequestId(request);
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email ||
    !password
  )
    return NextResponse.json(
      { code: "INVALID_REQUEST", requestId },
      { status: 400, headers: { "content-type": "application/problem+json" } },
    );
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key)
    return NextResponse.json(
      { code: "AUTH_NOT_CONFIGURED", requestId },
      { status: 503, headers: { "content-type": "application/problem+json" } },
    );
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: key, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  if (!response.ok)
    return NextResponse.json(
      { code: "INVALID_CREDENTIALS", requestId },
      { status: 401, headers: { "content-type": "application/problem+json" } },
    );
  const tokens = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!tokens.access_token || !tokens.refresh_token)
    return NextResponse.json(
      { code: "AUTH_PROVIDER_RESPONSE_INVALID", requestId },
      { status: 502, headers: { "content-type": "application/problem+json" } },
    );
  const redirect = adminRedirectUrl(request, "/");
  if (!redirect)
    return NextResponse.json(
      { code: "APPLICATION_ORIGIN_NOT_CONFIGURED", requestId },
      { status: 503, headers: { "content-type": "application/problem+json" } },
    );
  const next = NextResponse.redirect(redirect);
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
