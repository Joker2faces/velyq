import { NextResponse } from "next/server";
import { adminRedirectUrl } from "../../../../admin-api";

function getCookie(request: Request, name: string) {
  return (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

async function revokeSupabaseSession(request: Request) {
  const token = getCookie(request, "velyq_access_token");
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  if (!token || !url || !key) return;
  try {
    await fetch(`${url}/auth/v1/logout`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    // Local cookies must still be cleared when provider revocation is unavailable.
  }
}

export async function POST(request: Request) {
  await revokeSupabaseSession(request);
  const redirect = adminRedirectUrl(request, "/");
  const next = redirect
    ? NextResponse.redirect(redirect)
    : NextResponse.json(
        { code: "APPLICATION_ORIGIN_NOT_CONFIGURED" },
        { status: 503 },
      );
  for (const name of ["velyq_access_token", "velyq_refresh_token"]) {
    next.cookies.set(name, "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
  return next;
}
