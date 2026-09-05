import { NextResponse } from "next/server";
import { customerRedirectUrl, getCookie, requestId } from "../../../auth";
import { getStripeCustomer, stripeClient } from "../../../../billing";

export async function POST(request: Request) {
  const id = requestId(request);
  const token = getCookie(request, "velyq_access_token");
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  if (!token || !url || !key)
    return NextResponse.json(
      { code: "UNAUTHORIZED", requestId: id },
      { status: 401 },
    );
  const userResponse = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!userResponse.ok)
    return NextResponse.json(
      { code: "UNAUTHORIZED", requestId: id },
      { status: 401 },
    );
  const user = (await userResponse.json()) as { id?: string };
  if (!user.id)
    return NextResponse.json(
      { code: "UNAUTHORIZED", requestId: id },
      { status: 401 },
    );
  try {
    const customer = await getStripeCustomer(user.id);
    if (!customer)
      return NextResponse.json(
        { code: "BILLING_PROFILE_NOT_FOUND", requestId: id },
        { status: 409 },
      );
    const origin =
      process.env["VELYQ_APPLICATION_ORIGIN"] ?? new URL(request.url).origin;
    const session = await stripeClient().billingPortal.sessions.create({
      customer,
      return_url: `${origin}/account`,
    });
    const redirect = customerRedirectUrl(request, session.url);
    return redirect
      ? NextResponse.redirect(redirect)
      : NextResponse.json({ url: session.url, requestId: id });
  } catch {
    return NextResponse.json(
      { code: "BILLING_UNAVAILABLE", requestId: id },
      { status: 503 },
    );
  }
}
