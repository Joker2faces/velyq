/**
 * Prerenders public routes into `dist/client` so Cloudflare serves them as
 * static assets and never invokes the Worker for them.
 *
 * Why this exists: Cloudflare Workers Free allows ~10ms CPU per invocation,
 * and one Next SSR render of this app costs ~16ms at the median. Under any
 * sustained traffic the allowance is exhausted and every HTML route returns
 * 503 while cheap JSON routes keep working. Vinext (1.0.0-beta.9) classifies
 * routes as `○ Static` but emits no HTML into the asset directory, so every
 * page — even a static one — is rendered in the Worker on every request.
 *
 * Rather than migrate frameworks, this renders each public route once at
 * build time by asking the *already built* Worker for it, then writes the
 * result into the asset directory. The HTML therefore references exactly the
 * same Vite client chunks the Worker would have referenced, so there is no
 * second asset graph and no hydration mismatch. Cloudflare's asset layer
 * matches the path first and serves the file directly; the Worker is not
 * invoked at all.
 *
 * Usage: node tooling/scripts/prerender-public-routes.mjs <baseUrl> [distClientDir]
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { LOCALES, PUBLIC_ROUTES } from "./public-routes.mjs";

const BASE = process.argv[2] ?? "http://127.0.0.1:8799";
const OUT = resolve(process.argv[3] ?? "apps/web/dist/client");

/**
 * Refuses to write anything that looks like it carries a customer's state.
 * A static asset has no viewer, so this is the safety net that keeps the
 * migration from turning a personalised page into a public one.
 */
const FORBIDDEN = [
  "velyq_access_token",
  "velyq_refresh_token",
  "sb-access-token",
  "Signed in as",
  "Συνδεδεμένος ως",
];

function assetPathFor(route, prefix) {
  const path = `${prefix}${route === "/" ? "" : route}`;
  return join(OUT, path === "" ? "index.html" : `${path}/index.html`);
}

async function prerender() {
  const written = [];
  const problems = [];

  for (const { code, prefix } of LOCALES) {
    for (const route of PUBLIC_ROUTES) {
      const response = await fetch(`${BASE}${route}`, {
        headers: { cookie: `velyq-locale=${code}` },
        redirect: "manual",
      });
      if (response.status !== 200) {
        problems.push(`${code} ${route} -> ${response.status}`);
        continue;
      }
      const html = await response.text();

      const leak = FORBIDDEN.find((needle) => html.includes(needle));
      if (leak) {
        problems.push(`${code} ${route} -> refused, contains ${leak}`);
        continue;
      }
      if (!html.includes(`lang="${code}"`)) {
        problems.push(`${code} ${route} -> rendered wrong lang`);
        continue;
      }

      /*
       * Every asset the page asks for has to exist in this same build. A
       * stale `dist/server` left by an interrupted build renders HTML
       * referencing chunk hashes from the *previous* client build: it
       * deploys perfectly happily, serves 200, and then 404s every script,
       * so the page paints but never hydrates. Caught here rather than in
       * someone's browser console after release.
       */
      const missing = [
        ...new Set(
          [...html.matchAll(/\/_next\/static\/[A-Za-z0-9._/-]+/g)].map(
            ([match]) => match,
          ),
        ),
      ].filter((asset) => !existsSync(join(OUT, asset)));
      if (missing.length > 0) {
        problems.push(
          `${code} ${route} -> references assets missing from this build: ${missing.join(", ")}`,
        );
        continue;
      }

      const file = assetPathFor(route, prefix);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, html, "utf8");
      written.push(
        file
          .slice(OUT.length + 1)
          .split("\\")
          .join("/"),
      );
    }
  }

  return { written, problems };
}

const { written, problems } = await prerender();
for (const file of written) console.log(`  prerendered ${file}`);
if (problems.length) {
  console.error("\nFAILED:");
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(
  `\nOK — ${written.length} public routes prerendered as static assets.`,
);
