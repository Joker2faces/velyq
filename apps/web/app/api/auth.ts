import { NextResponse } from "next/server";

export async function requireCustomerSession(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const token = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("velyq_access_token="))
    ?.slice("velyq_access_token=".length);
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const publishableKey = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  if (token && url && publishableKey) {
    const response = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (response.ok) return null;
  }
  return NextResponse.json(
    {
      type: "https://velyq.dev/problems/unauthorized",
      title: "Authentication required",
      status: 401,
      code: "UNAUTHORIZED",
      requestId: crypto.randomUUID(),
    },
    { status: 401 },
  );
}
