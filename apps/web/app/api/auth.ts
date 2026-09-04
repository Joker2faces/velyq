import { NextResponse } from "next/server";

export function requireCustomerSession(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const authenticated = cookie
    .split(";")
    .some(
      (part) =>
        part.trim().startsWith("velyq_access_token=") &&
        part.trim().length > "velyq_access_token=".length,
    );
  if (authenticated) return null;
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
