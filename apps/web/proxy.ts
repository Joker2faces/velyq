import { NextResponse, type NextRequest } from "next/server";
import { applySecurityHeaders } from "./security-headers";

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

const PROTECTED_PREFIXES = [
  "/today",
  "/edge",
  "/radar",
  "/matches",
  "/account",
];

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function proxy(request: NextRequest) {
  /*
   * `next.config.js`'s `headers()` only takes effect on Next's own server
   * (Node/Vercel). Vinext's Cloudflare build does not apply it, so without
   * this every response the deployed Worker served — including the public
   * homepage — carried no CSP, no HSTS, no X-Frame-Options at all. This
   * function is the one thing both runtimes execute on every request, so it
   * is where the guarantee has to live rather than in config the platform
   * that actually serves production ignores.
   */
  if (!isProtectedPath(new URL(request.url).pathname))
    return applySecurityHeaders(NextResponse.next());

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
    return applySecurityHeaders(
      redirect
        ? NextResponse.redirect(redirect)
        : NextResponse.json(
            { code: "APPLICATION_ORIGIN_NOT_CONFIGURED" },
            { status: 503 },
          ),
    );
  }
  return applySecurityHeaders(NextResponse.next());
}

export const config = {
  /*
   * Every route, so the header guarantee is unconditional. Static assets are
   * excluded only because they are immutable, hashed and already safe by
   * construction — running the auth check against them would be wasted work,
   * not a security requirement.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|robots.txt|sitemap.xml).*)",
  ],
};
