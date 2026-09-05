import { NextResponse } from "next/server";
import { customerRedirectUrl, requestId } from "../../../auth";

export async function POST(request: Request) {
  const form = await request.formData();
  const email = form.get("email");
  const password = form.get("password");
  const id = requestId(request);
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email ||
    password.length < 8
  )
    return NextResponse.json(
      { code: "INVALID_REQUEST", requestId: id },
      { status: 400 },
    );
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key)
    return NextResponse.json(
      { code: "AUTH_NOT_CONFIGURED", requestId: id },
      { status: 503 },
    );
  const response = await fetch(`${url}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: key, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });
  if (!response.ok)
    return NextResponse.json(
      { code: "SIGN_UP_FAILED", requestId: id },
      { status: 400 },
    );
  const redirect = customerRedirectUrl(request, "/sign-in?registered=1");
  return redirect
    ? NextResponse.redirect(redirect)
    : NextResponse.json(
        { code: "APPLICATION_ORIGIN_NOT_CONFIGURED", requestId: id },
        { status: 503 },
      );
}
