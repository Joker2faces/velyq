import { NextResponse } from "next/server";
import { getCookie, requestId } from "../../../auth";

export async function POST(request: Request) {
  const refreshToken = getCookie(request, "velyq_refresh_token");
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const publishableKey = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  if (!refreshToken || !url || !publishableKey)
    return NextResponse.json(
      {
        type: "https://velyq.dev/problems/unauthorized",
        title: "Refresh token required",
        status: 401,
        code: "REFRESH_REQUIRED",
        requestId: requestId(request),
      },
      { status: 401 },
    );
  let providerResponse: Response;
  try {
    providerResponse = await fetch(
      `${url}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: { apikey: publishableKey, "content-type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
        cache: "no-store",
      },
    );
  } catch {
    providerResponse = new Response(null, { status: 503 });
  }
  if (!providerResponse.ok)
    return NextResponse.json(
      {
        type: "https://velyq.dev/problems/unauthorized",
        title: "Session refresh failed",
        status: 401,
        code: "REFRESH_FAILED",
        requestId: requestId(request),
      },
      { status: 401 },
    );
  const tokens = (await providerResponse.json()) as {
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
        requestId: requestId(request),
      },
      { status: 502 },
    );
  const response = NextResponse.json({ refreshed: true });
  response.cookies.set("velyq_access_token", tokens.access_token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: tokens.expires_in ?? 3600,
  });
  response.cookies.set("velyq_refresh_token", tokens.refresh_token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
