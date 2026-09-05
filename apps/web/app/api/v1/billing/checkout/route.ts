import { NextResponse } from "next/server";
import { customerRedirectUrl, getCookie, requestId } from "../../../auth";
import {
  getOrCreateStripeCustomer,
  priceIdFor,
  stripeClient,
  type PaidPlan,
} from "../../../../billing";

export async function POST(request: Request) {
  const id = requestId(request);
  const token = getCookie(request, "velyq_access_token");
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  const plan = (await request.formData()).get("plan");
  if (!token || !url || !key || (plan !== "PRO" && plan !== "ELITE"))
    return NextResponse.json(
      { code: "INVALID_REQUEST", requestId: id },
      { status: 400 },
    );
  const price = priceIdFor(plan as PaidPlan);
  if (!price)
    return NextResponse.json(
      { code: "PRICE_NOT_CONFIGURED", requestId: id },
      { status: 503 },
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
  const user = (await userResponse.json()) as { id?: string; email?: string };
  if (!user.id || !user.email)
    return NextResponse.json(
      { code: "UNAUTHORIZED", requestId: id },
      { status: 401 },
    );
  try {
    const customer = await getOrCreateStripeCustomer(user.id, user.email);
    const origin =
      process.env["VELYQ_APPLICATION_ORIGIN"] ?? new URL(request.url).origin;
    const session = await stripeClient().checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [{ price, quantity: 1 }],
      success_url: `${origin}/account?checkout=success`,
      cancel_url: `${origin}/pricing?checkout=cancelled`,
      client_reference_id: user.id,
      metadata: { velyqUserId: user.id, plan },
    });
    const redirect = customerRedirectUrl(request, session.url ?? "/pricing");
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
