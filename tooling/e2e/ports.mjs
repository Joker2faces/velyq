import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

function reservePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.unref();
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => resolvePort(server));
  });
}

export async function allocateE2ePorts() {
  const servers = await Promise.all([
    reservePort(),
    reservePort(),
    reservePort(),
    reservePort(),
  ]);
  const values = servers.map((server) => {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Unable to determine an available E2E port");
    }
    return address.port;
  });
  await Promise.all(
    servers.map(
      (server) =>
        new Promise((resolveClose, rejectClose) =>
          server.close((error) =>
            error ? rejectClose(error) : resolveClose(),
          ),
        ),
    ),
  );
  const [build, auth, customer, admin] = values;
  return { build, auth, customer, admin };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.stdout.write(JSON.stringify(await allocateE2ePorts()));
}
