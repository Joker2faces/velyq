import { NextResponse } from "next/server";
import {
  customerRedirectUrl,
  revokeCustomerSupabaseSession,
} from "../../../auth";

export async function POST(request: Request) {
  await revokeCustomerSupabaseSession(request);
  const redirect = customerRedirectUrl(request, "/sign-in");
  const response = redirect
    ? NextResponse.redirect(redirect)
    : NextResponse.json(
        { code: "APPLICATION_ORIGIN_NOT_CONFIGURED" },
        { status: 503 },
      );
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
