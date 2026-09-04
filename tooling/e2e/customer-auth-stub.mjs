import { createServer } from "node:http";

const port = Number(process.env.VELYQ_E2E_AUTH_PORT ?? 3101);
const accessToken = "e2e-customer-access-token";
const refreshToken = "e2e-customer-refresh-token";
const customerId = "00000000-0000-4000-8000-000000000001";

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
    if (request.headers.authorization !== `Bearer ${accessToken}`) {
      sendJson(response, 401, { error: "invalid_token" });
      return;
    }
    sendJson(response, 200, {
      id: customerId,
      email: "customer@example.test",
    });
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
    sendJson(response, 400, { error: "invalid_credentials" });
    return;
  }

  sendJson(response, 404, { error: "not_found" });
});

server.listen(port, "127.0.0.1");

function shutdown() {
  server.close(() => process.exit(0));
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
