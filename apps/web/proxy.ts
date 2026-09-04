import { NextResponse, type NextRequest } from "next/server";

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
    return NextResponse.redirect(new URL("/sign-in", request.url));
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
