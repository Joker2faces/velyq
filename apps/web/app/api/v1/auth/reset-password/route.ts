import { NextResponse } from "next/server";
import { requestId } from "../../../auth";

export async function POST(request: Request) {
  const id = requestId(request);
  const form = await request.formData();
  const password = form.get("password");
  const accessToken = form.get("access_token");
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    typeof accessToken !== "string" ||
    !accessToken ||
    !url ||
    !key
  )
    return NextResponse.json(
      { code: "INVALID_REQUEST", requestId: id },
      { status: 400 },
    );
  const response = await fetch(`${url}/auth/v1/user`, {
    method: "PUT",
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ password }),
    cache: "no-store",
  });
  if (!response.ok)
    return NextResponse.json(
      { code: "RESET_FAILED", requestId: id },
      { status: 400 },
    );
  return NextResponse.redirect(new URL("/sign-in?reset=success", request.url));
}
