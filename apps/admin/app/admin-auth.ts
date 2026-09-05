import type { Principal } from "@velyq/auth";

function cookie(request: Request, name: string) {
  return (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function userId(value: unknown) {
  if (typeof value !== "object" || value === null || !("id" in value))
    return null;
  const id = value.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export function createSupabaseAdminAuthenticator(
  resolvePrincipal: (userId: string) => Promise<Principal | null>,
) {
  return async (request: Request, requestId: string) => {
    const token = cookie(request, "velyq_access_token");
    const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
    const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
    const problem = (code: string, status: number, title: string) => ({
      type: `https://velyq.dev/problems/${code.toLowerCase()}`,
      title,
      status,
      code,
      requestId,
    });
    if (!token || !url || !key)
      return {
        problem: problem("UNAUTHORIZED", 401, "Authentication required"),
      };
    try {
      const response = await fetch(`${url}/auth/v1/user`, {
        headers: { apikey: key, Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const id = response.ok ? userId(await response.json()) : null;
      if (!id)
        return {
          problem: problem("UNAUTHORIZED", 401, "Authentication required"),
        };
      const principal = await resolvePrincipal(id);
      return principal
        ? { principal }
        : {
            problem: problem(
              "AUTHORIZATION_UNAVAILABLE",
              503,
              "Authorization is temporarily unavailable",
            ),
          };
    } catch {
      return {
        problem: problem(
          "AUTH_PROVIDER_UNAVAILABLE",
          503,
          "Authentication is temporarily unavailable",
        ),
      };
    }
  };
}
