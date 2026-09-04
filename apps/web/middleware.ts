import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  if (!request.cookies.get("velyq_access_token")?.value)
    return NextResponse.redirect(new URL("/sign-in", request.url));
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
