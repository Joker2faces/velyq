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
  const id = requestId(request);
  const browserError = () =>
    browserForm
      ? NextResponse.redirect(
          new URL("/forgot-password?error=unavailable", request.url),
        )
      : null;
  if (typeof email !== "string" || !email)
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
      browserError() ??
      NextResponse.json(
        { code: "AUTH_NOT_CONFIGURED", requestId: id },
        { status: 503 },
      )
    );
  await fetch(`${url}/auth/v1/recover`, {
    method: "POST",
    headers: { apikey: key, "content-type": "application/json" },
    body: JSON.stringify({ email }),
    cache: "no-store",
  });
  const redirect = customerRedirectUrl(request, "/sign-in?recovery=sent");
  return redirect
    ? NextResponse.redirect(redirect)
    : NextResponse.json(
        { code: "APPLICATION_ORIGIN_NOT_CONFIGURED", requestId: id },
        { status: 503 },
      );
}
