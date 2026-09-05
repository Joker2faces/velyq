import { createServer } from "node:http";

const port = Number(process.env.VELYQ_E2E_AUTH_PORT ?? 3101);
if (!Number.isSafeInteger(port)) {
  throw new Error("Playwright did not provide a valid E2E auth port");
}
const accessToken = "e2e-customer-access-token";
const refreshToken = "e2e-customer-refresh-token";
const customerId = "00000000-0000-4000-8000-000000000001";
const adminAccessToken = "e2e-admin-access-token";
const adminRefreshToken = "e2e-admin-refresh-token";
const adminId = "00000000-0000-4000-8000-000000000003";

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host}`);

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { status: "ok" });
    return;
  }

  if (request.method === "GET" && url.pathname === "/auth/v1/user") {
    if (request.headers.authorization === `Bearer ${accessToken}`) {
      sendJson(response, 200, {
        id: customerId,
        email: "customer@example.test",
      });
      return;
    }
    if (request.headers.authorization === `Bearer ${adminAccessToken}`) {
      sendJson(response, 200, { id: adminId, email: "admin@example.test" });
      return;
    }
    sendJson(response, 401, { error: "invalid_token" });
    return;
  }

  if (request.method === "POST" && url.pathname === "/auth/v1/token") {
    const body = await readBody(request);
    if (
      url.searchParams.get("grant_type") === "password" &&
      body.email === "customer@example.test" &&
      body.password === "customer-password"
    ) {
      sendJson(response, 200, {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: 3600,
      });
      return;
    }
    if (
      url.searchParams.get("grant_type") === "password" &&
      body.email === "admin@example.test" &&
      body.password === "admin-password"
    ) {
      sendJson(response, 200, {
        access_token: adminAccessToken,
        refresh_token: adminRefreshToken,
        expires_in: 3600,
      });
      return;
    }
    if (
      url.searchParams.get("grant_type") === "refresh_token" &&
      body.refresh_token === refreshToken
    ) {
      sendJson(response, 200, {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: 3600,
      });
      return;
    }
    if (
      url.searchParams.get("grant_type") === "refresh_token" &&
      body.refresh_token === adminRefreshToken
    ) {
      sendJson(response, 200, {
        access_token: adminAccessToken,
        refresh_token: adminRefreshToken,
        expires_in: 3600,
      });
      return;
    }
    sendJson(response, 400, { error: "invalid_credentials" });
    return;
  }

  sendJson(response, 404, { error: "not_found" });
});

server.once("error", (error) => {
  console.error(`Unable to start the E2E auth stub on port ${port}:`, error);
  process.exit(1);
});
server.listen(port, "127.0.0.1");

function shutdown() {
  server.close(() => process.exit(0));
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
