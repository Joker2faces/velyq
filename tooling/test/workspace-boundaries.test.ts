import path from "node:path";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const rootDirectory = fileURLToPath(new URL("../..", import.meta.url));
const linter = new ESLint({ cwd: rootDirectory, ignore: false });

async function lintFixture(
  name: string,
  workspaceUnit:
    "analytics" | "application" | "decimal" | "domain" = "analytics",
) {
  return linter.lintFiles(
    path.join(
      rootDirectory,
      "packages",
      workspaceUnit,
      "eslint-fixtures",
      "boundaries",
      name,
    ),
  );
}

describe("workspace dependency boundaries", () => {
  it("rejects a deep import into another package", async () => {
    const [result] = await lintFixture(
      "cross-package-internal.fixture.ts",
      "application",
    );

    expect(result.errorCount).toBeGreaterThan(0);
    expect(
      result.messages.some(
        (message) => message.ruleId === "no-restricted-imports",
      ),
    ).toBe(true);
  }, 30_000);

  it("rejects a relative filesystem import into another package", async () => {
    const [result] = await lintFixture(
      "relative-cross-package-internal.fixture.ts",
      "application",
    );

    expect(result.errorCount).toBe(1);
    expect(result.messages[0]?.ruleId).toBe(
      "velyq/no-cross-package-relative-import",
    );
  });

  it("rejects a literal dynamic import into another package", async () => {
    const [result] = await lintFixture(
      "dynamic-cross-package-internal.fixture.ts",
      "application",
    );

    expect(result.errorCount).toBe(1);
    expect(result.messages[0]?.ruleId).toBe(
      "velyq/no-cross-package-relative-import",
    );
  });

  it("permits a relative filesystem import within the same package", async () => {
    const [result] = await lintFixture(
      "same-package-relative.fixture.ts",
      "application",
    );

    expect(result.errorCount).toBe(0);
  });

  it("permits a literal dynamic import within the same package", async () => {
    const [result] = await lintFixture(
      "dynamic-same-package-relative.fixture.ts",
      "application",
    );

    expect(result.errorCount).toBe(0);
  });

  it("rejects framework and adapter dependencies from the domain package", async () => {
    const [result] = await lintFixture(
      "domain-forbidden-dependency.fixture.ts",
      "domain",
    );

    expect(result.errorCount).toBe(5);
    expect(
      result.messages.every(
        (message) => message.ruleId === "no-restricted-imports",
      ),
    ).toBe(true);
  });

  it("permits decimal.js only inside the decimal package", async () => {
    const [outsideResult] = await lintFixture("decimal-js-import.fixture.ts");
    const [insideResult] = await lintFixture(
      "decimal-js-import.fixture.ts",
      "decimal",
    );

    expect(outsideResult.errorCount).toBe(1);
    expect(outsideResult.messages[0]?.ruleId).toBe("no-restricted-imports");
    expect(insideResult.errorCount).toBe(0);
  });

  it("rejects computed arithmetic on imported decimal value fields", async () => {
    const [result] = await lintFixture("decimal-value-arithmetic.fixture.ts");

    expect(result.errorCount).toBe(1);
    expect(result.messages[0]?.ruleId).toBe(
      "velyq/no-branded-decimal-arithmetic",
    );
  });

  it("rejects destructured arithmetic on imported decimal value fields", async () => {
    const [result] = await lintFixture(
      "decimal-value-destructuring.fixture.ts",
    );

    expect(result.errorCount).toBe(1);
    expect(result.messages[0]?.ruleId).toBe(
      "velyq/no-branded-decimal-arithmetic",
    );
  });

  it("rejects arithmetic on the exported branded decimal scalar", async () => {
    const [result] = await lintFixture("decimal-string-arithmetic.fixture.ts");

    expect(result.errorCount).toBe(1);
    expect(result.messages[0]?.ruleId).toBe(
      "velyq/no-branded-decimal-arithmetic",
    );
  });

  it("rejects unary numeric coercion of a branded decimal scalar", async () => {
    const [result] = await lintFixture("decimal-unary-arithmetic.fixture.ts");

    expect(result.errorCount).toBe(2);
    expect(
      result.messages.every(
        (message) => message.ruleId === "velyq/no-branded-decimal-arithmetic",
      ),
    ).toBe(true);
  });

  it("rejects every arithmetic compound assignment with a branded decimal operand", async () => {
    const [result] = await lintFixture(
      "decimal-compound-assignment.fixture.ts",
    );

    expect(result.errorCount).toBe(6);
    expect(
      result.messages.every(
        (message) => message.ruleId === "velyq/no-branded-decimal-arithmetic",
      ),
    ).toBe(true);
  });

  it("allows non-arithmetic decimal uses and ordinary arithmetic", async () => {
    const [result] = await lintFixture("decimal-safe-operations.fixture.ts");

    expect(result.errorCount).toBe(0);
  });

  it("allows arithmetic on unrelated value properties", async () => {
    const [result] = await lintFixture("ordinary-value-arithmetic.fixture.ts");

    expect(result.errorCount).toBe(0);
  });

  it("allows an unrelated local type alias named DecimalString", async () => {
    const [result] = await lintFixture(
      "ordinary-decimal-string-alias.fixture.ts",
    );

    expect(result.errorCount).toBe(0);
  });

  it.each([
    "decimal-parameter-arithmetic.fixture.ts",
    "decimal-destructured-parameter.fixture.ts",
    "decimal-result-chain-arithmetic.fixture.ts",
  ])("rejects scoped decimal arithmetic in %s", async (fixture) => {
    const [result] = await lintFixture(fixture);

    expect(result.errorCount).toBe(1);
    expect(result.messages[0]?.ruleId).toBe(
      "velyq/no-branded-decimal-arithmetic",
    );
  });

  it("allows a shadowed ordinary value parameter", async () => {
    const [result] = await lintFixture("ordinary-shadowed-value.fixture.ts");

    expect(result.errorCount).toBe(0);
  });

  it.each([
    "decimal-money-result-arithmetic.fixture.ts",
    "decimal-inner-shadow.fixture.ts",
  ])("rejects type-branded arithmetic in %s", async (fixture) => {
    const [result] = await lintFixture(fixture);
    expect(result.errorCount).toBe(1);
    expect(result.messages[0]?.ruleId).toBe(
      "velyq/no-branded-decimal-arithmetic",
    );
  });

  it("rejects a nested typed binding shadowing an ordinary outer binding", async () => {
    const [result] = await lintFixture(
      "decimal-nested-typed-shadow.fixture.ts",
    );
    expect(result.errorCount).toBe(1);
    expect(result.messages[0]?.ruleId).toBe(
      "velyq/no-branded-decimal-arithmetic",
    );
  });

  it.each([
    "ordinary-after-typed-parameter.fixture.ts",
    "ordinary-shadowed-result.fixture.ts",
  ])("allows ordinary scoped values in %s", async (fixture) => {
    const [result] = await lintFixture(fixture);
    expect(result.errorCount).toBe(0);
  });
});
