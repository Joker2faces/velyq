#!/usr/bin/env node
/*
 * Stamps an isolated release-candidate Worker configuration from the Vinext
 * build output.
 *
 * `vinext build` writes apps/web/dist/server/wrangler.json carrying the
 * canonical worker's own name and origin, so deploying that file directly
 * overwrites the canonical worker. A release candidate must never do that,
 * and the previous RC was stamped by hand -- which is exactly how a hand
 * edit ends up shipping the wrong data mode. This derives the RC name from
 * the committed SHA instead, so the deployed artifact and the commit it was
 * built from cannot drift apart.
 *
 * It writes a SEPARATE config beside the generated one (relative `main` and
 * `assets.directory` paths resolve against the config's own directory, so
 * they stay correct) and never mutates the build output.
 *
 * Usage: node tooling/scripts/stamp-release-candidate.mjs [--sha <sha>]
 * Prints the path to deploy with `wrangler deploy --config <path>`.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const generated = join(repoRoot, "apps/web/dist/server/wrangler.json");

/* The canonical worker. A release candidate that resolved to this name would
   silently promote unreviewed code to the deployment the owner uses. */
const CANONICAL_WORKER = "velyq-poc";
const WORKERS_SUBDOMAIN = "joker2face1990.workers.dev";

const shaFlag = process.argv.indexOf("--sha");
const sha =
  shaFlag !== -1 && process.argv[shaFlag + 1]
    ? process.argv[shaFlag + 1]
    : execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: repoRoot,
        encoding: "utf8",
      }).trim();

if (!/^[0-9a-f]{40}$/.test(sha)) {
  throw new Error(`Refusing to stamp an RC from a non-commit SHA: ${sha}`);
}

const config = JSON.parse(readFileSync(generated, "utf8"));
const rcName = `velyq-rc-${sha.slice(0, 8)}`;

if (rcName === CANONICAL_WORKER) {
  throw new Error(`Refusing to stamp the canonical worker ${CANONICAL_WORKER}`);
}

/* The whole point of the P0: a release candidate must prove LIVE behaviour,
   so it may not inherit or be handed a synthetic data mode. Asserting here
   rather than assigning keeps the base wrangler config the single source of
   truth -- if that config regresses to SYNTHETIC_DEMO, this fails loudly
   instead of papering over it at deploy time. */
const mode = config.vars?.VELYQ_CUSTOMER_INTELLIGENCE_MODE;
if (mode !== "LIVE") {
  throw new Error(
    `Refusing to deploy a release candidate in data mode ${mode ?? "(unset)"}; expected LIVE`,
  );
}

config.name = rcName;
/* Redirects and cookie origins must point at the RC itself, not at the
   canonical worker the build output names. */
config.vars.VELYQ_APPLICATION_ORIGIN = `https://${rcName}.${WORKERS_SUBDOMAIN}`;
/* `env` exists only to make SYNTHETIC_DEMO an explicit opt-in; an RC has no
   use for it, and leaving it deployable is a way to reach synthetic data. */
delete config.env;

const target = join(repoRoot, "apps/web/dist/server/wrangler.rc.json");
writeFileSync(target, `${JSON.stringify(config, null, 2)}\n`);

console.log(`name:   ${rcName}`);
console.log(`origin: ${config.vars.VELYQ_APPLICATION_ORIGIN}`);
console.log(`mode:   ${mode}`);
console.log(`config: ${target}`);
