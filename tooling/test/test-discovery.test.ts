import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the one failure mode a test suite cannot report about itself.
 *
 * `workers/` was missing from the Vitest `include` list, so
 * `workers/prediction/test/index.test.ts` had never run — not in CI, not
 * locally, not once. It contained a stale assertion that had been wrong for as
 * long as the glob was, and nothing surfaced it, because a green run says
 * nothing about the files it never looked at.
 *
 * That class of defect is invisible to every other test by construction, so it
 * needs a test of its own: enumerate every test file in the repository, then
 * assert the configuration actually matches it. Adding a new workspace
 * directory with tests and forgetting the glob now fails here instead of
 * silently reporting success.
 */

const workspaceRoot = path.resolve(import.meta.dirname, "../..");

/** Directories that never contain workspace source. */
const SKIP = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  "dist",
  "coverage",
  "playwright-report",
  "test-results",
  ".worktrees",
  ".vercel",
  "data",
]);

function testFilesUnder(directory: string): readonly string[] {
  const found: string[] = [];
  const walk = (absolute: string) => {
    for (const entry of readdirSync(absolute)) {
      if (SKIP.has(entry)) continue;
      const child = path.join(absolute, entry);
      if (statSync(child).isDirectory()) {
        walk(child);
        continue;
      }
      if (/\.test\.tsx?$/.test(entry))
        /* Posix separators: the include globs are written that way. */
        found.push(path.relative(directory, child).split(path.sep).join("/"));
    }
  };
  walk(directory);
  return found.sort();
}

/**
 * Every `include` array declared across every real Vitest config, not just
 * the default one.
 *
 * `vitest.db-integration.config.mts` deliberately covers a disjoint set of
 * files (real-database tests that must never run without a live Postgres,
 * see that file's own docblock) -- a file matched there and nowhere else is
 * still genuinely discovered, run in its own CI job, not silently dropped.
 *
 * Parsed from source rather than imported, because importing the config
 * would let a future default or a merged preset supply patterns that the
 * file itself does not state — and the point of this guard is to check the
 * thing a reviewer sees when they open it.
 */
const VITEST_CONFIG_FILES = [
  "tooling/vitest/vitest.config.mts",
  "tooling/vitest/vitest.db-integration.config.mts",
];

function declaredIncludePatterns(): readonly string[] {
  return VITEST_CONFIG_FILES.flatMap((relativePath) => {
    const source = readFileSync(path.join(workspaceRoot, relativePath), "utf8");
    const block = /include:\s*\[([\s\S]*?)\]/.exec(source);
    expect(
      block,
      `${relativePath} must declare an include array`,
    ).not.toBeNull();
    return [...(block?.[1] ?? "").matchAll(/"([^"]+)"/g)].map(
      (match) => match[1]!,
    );
  });
}

describe("every test file in the repository is actually discovered", () => {
  const patterns = declaredIncludePatterns();
  const files = testFilesUnder(workspaceRoot);

  it("finds test files to check", () => {
    /*
     * A guard that silently matched nothing would be the same defect wearing
     * a different hat.
     */
    expect(files.length).toBeGreaterThan(50);
    expect(patterns.length).toBeGreaterThan(0);
  });

  it("matches every test file against a declared include pattern", () => {
    const unmatched = files.filter(
      (file) => !patterns.some((pattern) => path.matchesGlob(file, pattern)),
    );

    expect(
      unmatched,
      `These test files exist but no Vitest include pattern matches them, so ` +
        `they never run. Add a pattern to tooling/vitest/vitest.config.mts ` +
        `or move the files:\n  ${unmatched.join("\n  ")}`,
    ).toEqual([]);
  });

  it("covers the workers directory specifically", () => {
    /*
     * Named explicitly because this is the directory that was missing. A
     * generic assertion would pass again the moment someone removed the
     * pattern and the worker tests happened to be deleted in the same change.
     */
    expect(
      patterns.some((pattern) => pattern.startsWith("workers/")),
      "workers/*/test/** must be included",
    ).toBe(true);
  });
});
