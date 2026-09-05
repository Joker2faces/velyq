import { createServer } from "node:net";

import { describe, expect, it } from "vitest";

import { allocateE2ePorts } from "../e2e/ports.mjs";

describe("Playwright E2E port allocation", () => {
  it("returns distinct ports that are available to the E2E servers", async () => {
    const ports = await allocateE2ePorts();
    const values = Object.values(ports);

    expect(new Set(values).size).toBe(values.length);

    await Promise.all(
      values.map(
        (port) =>
          new Promise<void>((resolve, reject) => {
            const server = createServer();
            server.once("error", reject);
            server.listen(port, "127.0.0.1", () => {
              server.close((error) => (error ? reject(error) : resolve()));
            });
          }),
      ),
    );
  });
});
