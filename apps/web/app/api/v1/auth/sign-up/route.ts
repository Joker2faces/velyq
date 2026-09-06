import { NextResponse } from "next/server";
import { customerRedirectUrl, requestId } from "../../../auth";
import { readAuthRequestFields } from "../request-body";

export async function POST(request: Request) {
  const browserForm =
    request.headers.get("accept")?.includes("text/html") ?? false;
  /*
   * Reads a browser form post or a JSON body. An unparseable body
   * yields an empty field set, so the validation just below reports
   * INVALID_REQUEST exactly as it does for a missing field — rather
   * than throwing, which is what `request.formData()` did to every
   * JSON caller.
   */
  const form = (await readAuthRequestFields(request)) ?? {
    get: () => null,
  };
  const email = form.get("email");
  const password = form.get("password");
  const id = requestId(request);
  const browserError = () =>
    browserForm
      ? NextResponse.redirect(new URL("/sign-up?error=invalid", request.url))
      : null;
  const browserUnavailable = () =>
    browserForm
      ? NextResponse.redirect(
          new URL("/sign-up?error=unavailable", request.url),
        )
      : null;
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email ||
    password.length < 8
  )
    return (
      browserError() ??
      NextResponse.json(
        { code: "INVALID_REQUEST", requestId: id },
        { status: 400 },
      )
    );
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key)
    return (
      browserUnavailable() ??
      NextResponse.json(
        { code: "AUTH_NOT_CONFIGURED", requestId: id },
        { status: 503 },
      )
    );
  let response: Response;
  try {
    response = await fetch(`${url}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey: key, "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
  } catch {
    return (
      browserUnavailable() ??
      NextResponse.json(
        { code: "AUTH_PROVIDER_UNAVAILABLE", requestId: id },
        { status: 503 },
      )
    );
  }
  if (!response.ok)
    return (
      (browserForm && isTemporaryProviderFailure(response.status)
        ? browserUnavailable()
        : browserError()) ??
      NextResponse.json(
        { code: "SIGN_UP_FAILED", requestId: id },
        { status: 400 },
      )
    );
  const redirect = customerRedirectUrl(request, "/sign-in?registered=1");
  return redirect
    ? NextResponse.redirect(redirect)
    : NextResponse.json(
        { code: "APPLICATION_ORIGIN_NOT_CONFIGURED", requestId: id },
        { status: 503 },
      );
}

function isTemporaryProviderFailure(status: number) {
  return status === 408 || status === 429 || status >= 500;
}
