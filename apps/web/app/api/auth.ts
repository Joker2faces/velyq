import { NextResponse } from "next/server";
import { hasPermission } from "@velyq/auth";
import {
  createPrivilegedDatabaseClient,
  DatabasePermissionResolver,
} from "@velyq/database";

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
      if (response.ok) {
        const user = (await response.json()) as { id?: string };
        if (!user.id) return unauthorized(request);
        const databaseUrl = process.env["VELYQ_DATABASE_URL"];
        if (!databaseUrl) return null;
        const client = createPrivilegedDatabaseClient({
          connectionString: databaseUrl,
        });
        try {
          const principal = await new DatabasePermissionResolver(
            client.database,
          ).resolve(user.id);
          if (hasPermission(principal, "customer.read")) return null;
          return forbidden(request);
        } finally {
          await client.close();
        }
      }
    } catch {
      // Treat provider/network failures as an unauthenticated request.
    }
  }
  return unauthorized(request);
}

function unauthorized(request: Request) {
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

function forbidden(request: Request) {
  return NextResponse.json(
    {
      type: "https://velyq.dev/problems/forbidden",
      title: "Customer access required",
      status: 403,
      code: "FORBIDDEN",
      requestId: requestId(request),
    },
    { status: 403 },
  );
}
