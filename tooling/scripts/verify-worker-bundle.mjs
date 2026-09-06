/**
 * Asserts that the emitted Cloudflare Worker really talks to Hyperdrive.
 *
 * This is ground truth, and it exists because nothing else was. The Worker
 * build once shipped the Node database source — reading a `VELYQ_DATABASE_URL`
 * that Cloudflare never sets — while the build succeeded, typecheck passed and
 * a resolver-level unit test went green, because that test applied
 * `resolve.alias` without running plugin hooks. The only artefact that could
 * have revealed it was the bundle itself.
 *
 * Usage: node tooling/scripts/verify-worker-bundle.mjs [distServerDir]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const serverDirectory = resolve(process.argv[2] ?? "apps/web/dist/server");

function sourceFiles(directory) {
  const found = [];
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (/\.(js|mjs)$/.test(entry)) found.push(full);
  }
  return found;
}

let files;
try {
  files = sourceFiles(serverDirectory);
} catch {
  console.error(
    `No Worker build at ${serverDirectory}. Run \`pnpm build:vinext\` in apps/web first.`,
  );
  process.exit(1);
}

const contents = files.map((file) => [file, readFileSync(file, "utf8")]);
const problems = [];

// The Node source must not reach the Worker at all.
const leaked = contents.filter(([, text]) =>
  text.includes("process.env.VELYQ_DATABASE_URL"),
);
if (leaked.length)
  problems.push(
    `The Node database source was bundled into the Worker (${leaked
      .map(([file]) => file)
      .join(
        ", ",
      )}). Cloudflare does not set VELYQ_DATABASE_URL, so this Worker has no database.`,
  );

// The Hyperdrive source must be present and must read the binding.
const usesBinding = contents.some(([, text]) =>
  /HYPERDRIVE\s*\??\.\s*connectionString/.test(text),
);
if (!usesBinding)
  problems.push(
    "No Worker chunk reads env.HYPERDRIVE.connectionString, so the Hyperdrive database source was not bundled.",
  );

if (problems.length) {
  for (const problem of problems) console.error(`FAIL  ${problem}`);
  process.exit(1);
}

console.log(
  `OK — Worker bundle resolves Hyperdrive and contains no VELYQ_DATABASE_URL (${files.length} chunks checked).`,
);
