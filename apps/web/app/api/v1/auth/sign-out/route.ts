import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/sign-in", request.url));
  for (const name of ["velyq_access_token", "velyq_refresh_token"]) {
    response.cookies.set(name, "", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
  return response;
}
