import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as signIn } from "../app/api/v1/auth/sign-in/route";
import { POST as signUp } from "../app/api/v1/auth/sign-up/route";
import { POST as forgotPassword } from "../app/api/v1/auth/forgot-password/route";
import { POST as resetPassword } from "../app/api/v1/auth/reset-password/route";
import { POST as signOut } from "../app/api/v1/auth/sign-out/route";

let closeServer: (() => Promise<void>) | undefined;

beforeEach(() => {
  process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = "publishable-test";
});

afterEach(async () => {
  await closeServer?.();
  closeServer = undefined;
  delete process.env["NEXT_PUBLIC_SUPABASE_URL"];
  delete process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  delete process.env["VELYQ_APPLICATION_ORIGIN"];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("all auth form POST page redirects", () => {
  const origin = "https://rc.velyq.test";

  beforeEach(() => {
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://supabase.test";
    process.env["VELYQ_APPLICATION_ORIGIN"] = origin;
  });

  it.each([
    [
      "sign-up",
      signUp,
      "/api/v1/auth/sign-up",
      { email: "customer@example.test", password: "customer-password" },
      "/sign-in?registered=1",
    ],
    [
      "forgot-password",
      forgotPassword,
      "/api/v1/auth/forgot-password",
      { email: "customer@example.test" },
      "/sign-in?recovery=sent",
    ],
    [
      "reset-password",
      resetPassword,
      "/api/v1/auth/reset-password",
      { access_token: "reset-token", password: "customer-password" },
      "/sign-in?reset=success",
    ],
  ] as const)(
    "%s success uses 303 before a browser page",
    async (_name, handler, path, fields, expectedPath) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("{}", { status: 200 })),
      );
      const response = await handler(browserFormRequest(origin, path, fields));
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(`${origin}${expectedPath}`);
    },
  );

  it.each([
    ["customer", signOut, "/api/v1/auth/sign-out", "/sign-in"],
  ] as const)(
    "%s sign-out uses 303 and clears both session cookies",
    async (_name, handler, path, expectedPath) => {
      const response = await handler(browserFormRequest(origin, path, {}));
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(`${origin}${expectedPath}`);
      expect(response.headers.getSetCookie()).toHaveLength(2);
    },
  );
});

describe("browser auth Post/Redirect/Get semantics", () => {
  it("protects the Cloudflare/Vinext static /today shell with POST -> 303 -> GET -> 200", async () => {
    const observedTodayMethods: string[] = [];
    const origin = await startAuthTestServer({
      providerStatus: 200,
      observedTodayMethods,
    });
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = origin;
    process.env["VELYQ_APPLICATION_ORIGIN"] = origin;

    const manual = await postSignIn(origin, "manual");
    expect(manual.status).toBe(303);
    expect(manual.headers.get("location")).toBe(`${origin}/today`);
    expect(manual.headers.getSetCookie()).toHaveLength(2);

    const followed = await postSignIn(origin, "follow");
    expect(followed.status).toBe(200);
    expect(followed.url).toBe(`${origin}/today`);
    expect(observedTodayMethods).toEqual(["GET"]);
  });

  it.each([
    [400, "/sign-in?error=invalid"],
    [503, "/sign-in?error=unavailable"],
  ] as const)(
    "maps provider status %s to a 303 browser redirect",
    async (providerStatus, expectedPath) => {
      const origin = await startAuthTestServer({
        providerStatus,
        observedTodayMethods: [],
      });
      process.env["NEXT_PUBLIC_SUPABASE_URL"] = origin;
      process.env["VELYQ_APPLICATION_ORIGIN"] = origin;

      const response = await postSignIn(origin, "manual");
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(`${origin}${expectedPath}`);
    },
  );
});

async function postSignIn(origin: string, redirect: "manual" | "follow") {
  return fetch(`${origin}/api/v1/auth/sign-in`, {
    method: "POST",
    headers: {
      accept: "text/html",
      origin,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      email: "customer@example.test",
      password: "customer-password",
    }),
    redirect,
  });
}

function browserFormRequest(
  origin: string,
  path: string,
  fields: Record<string, string>,
) {
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers: {
      accept: "text/html",
      origin,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(fields),
  });
}

async function startAuthTestServer({
  providerStatus,
  observedTodayMethods,
}: {
  providerStatus: number;
  observedTodayMethods: string[];
}) {
  const server = createServer(async (request, response) => {
    const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const url = new URL(request.url ?? "/", origin);

    if (url.pathname === "/auth/v1/token") {
      sendProviderResponse(response, providerStatus);
      return;
    }
    if (url.pathname === "/api/v1/auth/sign-in") {
      const body = await readBody(request);
      const routeResponse = await signIn(
        new Request(url, {
          method: request.method,
          headers: incomingHeaders(request),
          body,
          duplex: "half",
        } as RequestInit & { duplex: "half" }),
      );
      response.writeHead(routeResponse.status, headersForNode(routeResponse));
      response.end(Buffer.from(await routeResponse.arrayBuffer()));
      return;
    }
    if (url.pathname === "/today") {
      observedTodayMethods.push(request.method ?? "UNKNOWN");
      response.writeHead(request.method === "GET" ? 200 : 405, {
        "content-type": "text/html",
      });
      response.end("<!doctype html><title>Today</title><h1>Today</h1>");
      return;
    }
    response.writeHead(404).end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  closeServer = () =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test port");
  return `http://127.0.0.1:${address.port}`;
}

function sendProviderResponse(response: ServerResponse, status: number) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(
    JSON.stringify(
      status === 200
        ? {
            access_token: "test-access-token",
            refresh_token: "test-refresh-token",
            expires_in: 3600,
          }
        : { error: status >= 500 ? "unavailable" : "invalid_grant" },
    ),
  );
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

function headersForNode(response: Response) {
  const headers: Record<string, string | string[]> = {};
  for (const [name, value] of response.headers) headers[name] = value;
  const cookies = response.headers.getSetCookie();
  if (cookies.length) headers["set-cookie"] = cookies;
  return headers;
}

function incomingHeaders(request: IncomingMessage) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) headers.set(name, value);
  }
  return headers;
}
