import { NextResponse } from "next/server";

export function getCookie(request: Request, name: string) {
  return (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export function requestId(request: Request) {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export async function requireCustomerSession(request: Request) {
  const token = getCookie(request, "velyq_access_token");
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const publishableKey = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  if (token && url && publishableKey) {
    try {
      const response = await fetch(`${url}/auth/v1/user`, {
        headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (response.ok) return null;
    } catch {
      // Treat provider/network failures as an unauthenticated request.
    }
  }
  return NextResponse.json(
    {
      type: "https://velyq.dev/problems/unauthorized",
      title: "Authentication required",
      status: 401,
      code: "UNAUTHORIZED",
      requestId: requestId(request),
    },
    { status: 401 },
  );
}
