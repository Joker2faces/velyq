import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  dataMode,
  requiresPreviewDisclosure,
  messages,
  translations,
  recommendationLabel,
  type Locale,
} from "@velyq/ui";

/**
 * What a customer is allowed to read.
 *
 * VELYQ's own vocabulary leaked into the product because nothing stopped it:
 * "Synthetic data" and "Development heuristic" were badges on every
 * intelligence page, `admin.access` was rendered as a chip on the account
 * page, and the pricing page carried a panel explaining that administrator
 * rights are "granted separately in the database". Each was written honestly
 * — and each described the implementation to someone who had asked about
 * football.
 *
 * These tests are the guard. They read the shipped message catalogue and the
 * customer app's own source, so a term reintroduced in either place fails
 * here rather than in front of a customer.
 *
 * The admin console is deliberately exempt: it is an operations tool, and
 * "provider run" is the right words there.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, "../../..");
const customerAppRoot = resolve(here, "../app");

/*
 * Vocabulary that must never reach a customer.
 *
 * Split by reason, because the reasons are different: infrastructure nouns
 * describe how VELYQ is hosted, engineering nouns describe how it is built,
 * and authorization nouns describe who may do what. A customer needs none of
 * the three, but the failure message should say which one it is.
 */
const FORBIDDEN_VOCABULARY: readonly (readonly [string, readonly string[]])[] =
  [
    [
      "infrastructure",
      [
        "supabase",
        "hyperdrive",
        "cloudflare",
        "wrangler",
        "drizzle",
        "stripe price id",
        "database",
        "βάση δεδομένων",
      ],
    ],
    [
      "engineering process",
      [
        "synthetic",
        "συνθετικ",
        /*
         * "fixture" on its own is football: a scheduled match, and the right
         * word for one. Only the engineering compounds are forbidden.
         */
        "test fixture",
        "fixture data",
        "fixture seed",
        "demo fixture",
        "mock-up",
        "mock up",
        "dummy",
        "stub",
        "seeded",
        "e2e",
        "debug",
        "development heuristic",
        "δείκτης υπό ανάπτυξη",
        "phase 1",
        "φάση 1",
        "deterministic model",
        "serialization",
        "provider adapter",
      ],
    ],
    [
      /*
       * Notes the team left for itself, published to customers.
       *
       * The legal pages carried "This draft requires legal review before
       * commercial scale" and, on the subscription terms, "require owner and
       * legal review before any live charge is taken" — in both languages.
       * Honest internally, and much worse on a customer page than any badge:
       * it told people the terms they were being asked to accept were not
       * finished, in the vocabulary of the team's own to-do list. The fact
       * that the terms are provisional is worth stating; it just has to be
       * stated to the reader rather than about the project.
       */
      "internal process",
      [
        "requires legal review",
        "legal review",
        "owner review",
        "owner and legal",
        "before commercial scale",
        "προσχέδιο",
        "νομικό έλεγχο",
        "ιδιοκτήτη",
      ],
    ],
    [
      "authorization internals",
      [
        "admin.access",
        "customer.read",
        "administrator permission",
        "administrative access",
        "δικαιώματα διαχειριστή",
        "server-side",
        "today.view",
        "edge.full",
        "edge.preview",
        "radar.full",
        "radar.preview",
        "match.detail",
      ],
    ],
  ];

/** Message keys the admin console owns; its vocabulary is its own. */
function isAdminKey(key: string) {
  return key.startsWith("admin") || key.startsWith("ops");
}

function customerSourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      /* `api/` is server code: its strings go to logs, never to a screen. */
      if (entry === "api") continue;
      found.push(...customerSourceFiles(path));
      continue;
    }
    /*
     * `staging-status-shell` is a deploy placeholder, not a customer page: no
     * route imports it, so it is unreachable from the product. Its copy names
     * the staging environment and the data behind it on purpose, which is
     * exactly right for a placeholder and exactly wrong to sanitise.
     */
    if (entry.startsWith("staging-status-shell")) continue;
    if (entry.endsWith(".tsx")) found.push(path);
  }
  return found;
}

describe("customer-facing vocabulary", () => {
  const locales: readonly Locale[] = ["en", "el"];

  for (const [reason, terms] of FORBIDDEN_VOCABULARY) {
    it(`keeps ${reason} vocabulary out of every customer message`, () => {
      const offences: string[] = [];
      for (const locale of locales) {
        const catalog = translations[locale];
        for (const [key, value] of Object.entries(catalog)) {
          if (isAdminKey(key)) continue;
          const haystack = value.toLowerCase();
          for (const term of terms) {
            if (haystack.includes(term)) {
              offences.push(`${locale}.${key} contains "${term}": ${value}`);
            }
          }
        }
      }
      expect(offences).toEqual([]);
    });
  }

  it("renders no forbidden vocabulary literally in the customer app", () => {
    const terms = FORBIDDEN_VOCABULARY.flatMap(([, list]) => list);
    const offences: string[] = [];
    for (const file of customerSourceFiles(customerAppRoot)) {
      const source = readFileSync(file, "utf8");
      /*
       * Comments are stripped first: the reasoning lives there, and it has to
       * be able to name the thing it removed.
       *
       * What remains is narrowed to prose — quoted strings and JSX text
       * containing a space. Identifiers never contain one, which is what
       * separates the contract field `data.syntheticLabel` (a name, never
       * shown) from the string "Synthetic data" (copy, shown). Scanning the
       * raw source instead reported every surface that reads the provenance
       * field, and would have forced the field to be renamed to satisfy a
       * test about customer copy.
       */
      const withoutComments = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      const prose = [
        ...withoutComments.matchAll(/"([^"\n]*\s[^"\n]*)"/g),
        ...withoutComments.matchAll(/>([^<>{}\n]*\s[^<>{}\n]*)</g),
      ]
        .map((match) => match[1] ?? "")
        .join(" | ")
        .toLowerCase();
      for (const term of terms) {
        if (prose.includes(term)) {
          offences.push(`${relative(repositoryRoot, file)} renders "${term}"`);
        }
      }
    }
    expect(offences).toEqual([]);
  });

  it("never shows a customer a raw recommendation code", () => {
    const codes = [
      "STRONG_EDGE",
      "WAIT",
      "WAIT_FOR_LINEUP",
      "NO_BET",
      "INSUFFICIENT_DATA",
      "EDGE_DISAPPEARED",
    ] as const;
    for (const locale of locales) {
      for (const code of codes) {
        const label = recommendationLabel(code, locale);
        expect(label).not.toContain("_");
        expect(label).not.toBe(code);
        expect(label.trim()).not.toBe("");
      }
    }
  });

  it("gives every customer message a Greek translation", () => {
    const missing = Object.keys(messages).filter(
      (key) => !translations.el[key as keyof typeof translations.el],
    );
    expect(missing).toEqual([]);
  });
});

describe("data mode", () => {
  it("discloses a preview only when the data says it is synthetic", () => {
    expect(dataMode("Synthetic data")).toBe("DEMO");
    expect(requiresPreviewDisclosure("Synthetic data")).toBe(true);
  });

  it("treats real, absent and unrecognised provenance as live", () => {
    for (const provenance of [
      null,
      undefined,
      "",
      "   ",
      "Live market data",
      "Opta",
    ]) {
      expect(dataMode(provenance)).toBe("LIVE");
      expect(requiresPreviewDisclosure(provenance)).toBe(false);
    }
  });

  it("does not decide the mode from a partial match", () => {
    /*
     * A label that merely mentions the word must not switch the product into
     * preview mode, and — more importantly — a label that is nearly the
     * provenance marker must not be accepted as it. Only the contract's exact
     * marker counts.
     */
    expect(dataMode("Not synthetic data")).toBe("LIVE");
    expect(dataMode("Synthetic")).toBe("LIVE");
    expect(dataMode("synthetic data")).toBe("LIVE");
  });

  it("is driven by provenance, so live data is never hedged as a preview", () => {
    /*
     * The disclosure follows the rows rather than a setting beside them. This
     * is the property that matters: there is no flag to leave switched on
     * after real observations start flowing, and none to leave switched off
     * while fixtures are still being served.
     */
    const liveSurface = { syntheticLabel: "Live market data" };
    const previewSurface = { syntheticLabel: "Synthetic data" };
    expect(requiresPreviewDisclosure(liveSurface.syntheticLabel)).toBe(false);
    expect(requiresPreviewDisclosure(previewSurface.syntheticLabel)).toBe(true);
  });
});

describe("administration is separated from the customer product", () => {
  it("offers no admin entry point anywhere in the customer navigation", () => {
    const shell = readFileSync(
      resolve(customerAppRoot, "customer-shell.tsx"),
      "utf8",
    );
    /*
     * The link is rendered by `AdminConsoleLink`, which resolves
     * `isAdmin` from the customer's own context API. The shell must not
     * decide it: the shell is a static asset served to everyone.
     */
    expect(shell).toContain("AdminConsoleLink");
    expect(shell).not.toMatch(/plan\s*===?\s*"ELITE"/);
    expect(shell).not.toMatch(/plan\s*===?\s*"PRO"/);
  });

  it("never derives admin access from a plan", () => {
    const offences: string[] = [];
    for (const file of customerSourceFiles(customerAppRoot)) {
      const source = readFileSync(file, "utf8");
      /*
       * `isAdmin` is the server's answer from the permission resolver. A plan
       * comparison standing in for it would hand administration to anyone who
       * paid, which is the one mistake this boundary exists to prevent.
       */
      if (/isAdmin\s*[=:]\s*[^=]*\bplan\b/.test(source)) {
        offences.push(
          `${relative(repositoryRoot, file)} derives isAdmin from a plan`,
        );
      }
    }
    expect(offences).toEqual([]);
  });

  it("gates the admin console link on the permission, not the plan", () => {
    const link = readFileSync(
      resolve(customerAppRoot, "customer/admin-console-link.tsx"),
      "utf8",
    );
    expect(link).toContain("state.data.isAdmin");
    expect(link).not.toContain("ELITE");
  });
});
