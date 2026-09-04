import { NextResponse } from "next/server";
export async function POST(request: Request) {
  const next = NextResponse.redirect(new URL("/", request.url));
  next.cookies.delete("velyq_access_token");
  next.cookies.delete("velyq_refresh_token");
  return next;
}
