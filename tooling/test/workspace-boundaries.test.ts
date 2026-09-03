import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const rootDirectory = fileURLToPath(new URL("../..", import.meta.url));

async function lintFixture(name: string, filePath: string) {
  const source = await readFile(
    new URL(`./fixtures/boundaries/${name}`, import.meta.url),
    "utf8",
  );
  const linter = new ESLint({ cwd: rootDirectory });

  return linter.lintText(source, { filePath });
}

describe("workspace dependency boundaries", () => {
  it("rejects a deep import into another package", async () => {
    const [result] = await lintFixture(
      "cross-package-internal.fixture.ts",
      "packages/application/src/fixture.ts",
    );

    expect(result.errorCount).toBeGreaterThan(0);
    expect(
      result.messages.some(
        (message) => message.ruleId === "no-restricted-imports",
      ),
    ).toBe(true);
  });

  it("rejects a relative filesystem import into another package", async () => {
    const [result] = await lintFixture(
      "relative-cross-package-internal.fixture.ts",
      "packages/application/src/fixture.ts",
    );

    expect(result.errorCount).toBe(1);
    expect(result.messages[0]?.ruleId).toBe(
      "velyq/no-cross-package-relative-import",
    );
  });

  it("rejects a literal dynamic import into another package", async () => {
    const [result] = await lintFixture(
      "dynamic-cross-package-internal.fixture.ts",
      "packages/application/src/fixture.ts",
    );

    expect(result.errorCount).toBe(1);
    expect(result.messages[0]?.ruleId).toBe(
      "velyq/no-cross-package-relative-import",
    );
  });

  it("permits a relative filesystem import within the same package", async () => {
    const [result] = await lintFixture(
      "same-package-relative.fixture.ts",
      "packages/application/src/fixture.ts",
    );

    expect(result.errorCount).toBe(0);
  });

  it("permits a literal dynamic import within the same package", async () => {
    const [result] = await lintFixture(
      "dynamic-same-package-relative.fixture.ts",
      "packages/application/src/fixture.ts",
    );

    expect(result.errorCount).toBe(0);
  });

  it("rejects framework and adapter dependencies from the domain package", async () => {
    const [result] = await lintFixture(
      "domain-forbidden-dependency.fixture.ts",
      "packages/domain/src/fixture.ts",
    );

    expect(result.errorCount).toBe(5);
    expect(
      result.messages.every(
        (message) => message.ruleId === "no-restricted-imports",
      ),
    ).toBe(true);
  });
});
