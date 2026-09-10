import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Customer copy must come from the shared message catalog.
 *
 * A local `locale === "el" ? "..." : "..."` object renders correctly today but
 * bypasses the one mechanism that guarantees Greek coverage: `messages.ts`
 * types the Greek catalog as `Readonly<Record<MessageKey, string>>`, so a
 * missing translation is a `typecheck` failure. Copy written inline in a view
 * has no such guarantee -- an English string added to the `: "..."` branch and
 * forgotten in the `? "..."` branch ships English onto a Greek page, silently.
 *
 * Four such blocks existed: an eleven-key object in `today-view.tsx`, a
 * twelve-key object plus two inline label functions in `results-view.tsx`, a
 * navigation item in `customer-shell.tsx`, and the Match Intelligence paywall
 * copy in `matches/[id]/page.tsx`. All four are now catalog-sourced.
 *
 * `intlLocale(locale)` is the sanctioned way to reach an Intl locale tag; it
 * carries the same conditional, once, in `packages/ui/src/locale.ts`.
 */

const APP_ROOT = join(import.meta.dirname, "..", "app");

function sourceFiles(directory: string): readonly string[] {
  const collected: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      collected.push(...sourceFiles(path));
      continue;
    }
    if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      collected.push(path);
    }
  }
  return collected;
}

/** Strips block and line comments so prose about the pattern is not a match. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

describe("customer copy is catalog-sourced", () => {
  const files = sourceFiles(APP_ROOT);

  it("finds the customer application source", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("branches on the locale nowhere in executable view code", () => {
    const offenders = files.filter((path) =>
      /locale\s*===\s*["']el["']/.test(
        withoutComments(readFileSync(path, "utf8")),
      ),
    );
    expect(offenders.map((path) => path.slice(APP_ROOT.length + 1))).toEqual(
      [],
    );
  });
});
