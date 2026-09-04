import { NextResponse, type NextRequest } from "next/server";

function signInUrl(request: NextRequest) {
  const configured = process.env["VELYQ_APPLICATION_ORIGIN"]?.trim();
  if (configured) {
    try {
      const origin = new URL(configured);
      if (
        (origin.protocol === "https:" || origin.protocol === "http:") &&
        !origin.username &&
        !origin.password
      )
        return new URL("/sign-in", origin.origin);
    } catch {
      // Fail closed below.
    }
    return null;
  }
  const fixtureMode =
    process.env["NODE_ENV"] !== "production" ||
    process.env["VELYQ_SYNTHETIC_PREVIEW"] === "true";
  return fixtureMode ? new URL("/sign-in", request.url) : null;
}

export async function proxy(request: NextRequest) {
  const token = request.cookies.get("velyq_access_token")?.value;
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const publishableKey = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  let authenticated = false;
  if (token && url && publishableKey) {
    try {
      const response = await fetch(`${url}/auth/v1/user`, {
        headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      authenticated = response.ok;
    } catch {
      authenticated = false;
    }
  }
  if (!authenticated) {
    const redirect = signInUrl(request);
    return redirect
      ? NextResponse.redirect(redirect)
      : NextResponse.json(
          { code: "APPLICATION_ORIGIN_NOT_CONFIGURED" },
          { status: 503 },
        );
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/today/:path*",
    "/edge/:path*",
    "/radar/:path*",
    "/matches/:path*",
    "/account/:path*",
  ],
};
