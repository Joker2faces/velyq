import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const ownerId = process.env.VELYQ_OWNER_USER_ID;
if (
  !ownerId ||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    ownerId,
  )
) {
  throw new Error("Set VELYQ_OWNER_USER_ID to an existing auth.users UUID.");
}

const seed = readFileSync(resolve("supabase/seed.sql"), "utf8");
const statements = seed
  .split(/;\s*(?=INSERT INTO )/)
  .map((statement) => statement.trim())
  .filter(Boolean)
  .filter(
    (statement) =>
      !/^(?:\s*--[^\r\n]*(?:\r?\n|$))*\s*INSERT INTO auth\.users\b/i.test(
        statement,
      ),
  )
  .map((statement) => {
    if (/^INSERT INTO public\.profiles\b/i.test(statement)) {
      return `INSERT INTO public.profiles (user_id, display_name, locale, timezone, created_at, updated_at)
VALUES ('${ownerId}', 'VELYQ Owner', 'en', 'UTC', '2026-09-04T00:00:00Z', '2026-09-04T00:00:00Z')
ON CONFLICT (user_id) DO UPDATE SET display_name = EXCLUDED.display_name, updated_at = EXCLUDED.updated_at`;
    }
    if (/^INSERT INTO private\.user_roles\b/i.test(statement)) {
      return `INSERT INTO private.user_roles (user_id, role_id, granted_by, granted_at)
SELECT '${ownerId}'::uuid, r.id, '${ownerId}'::uuid, '2026-09-04T00:00:00Z'
FROM private.roles r
WHERE r.code IN ('USER', 'ADMIN')
ON CONFLICT (user_id, role_id) DO NOTHING`;
    }
    return statement.replaceAll(
      "00000000-0000-4000-8000-000000000003",
      ownerId,
    );
  });

const corepackJs = resolve(
  dirname(process.execPath),
  "node_modules/corepack/dist/corepack.js",
);
const tempDirectory = mkdtempSync(resolve(tmpdir(), "velyq-staging-seed-"));
try {
  for (const [index, statement] of statements.entries()) {
    process.stdout.write(
      `Applying staging seed statement ${index + 1}/${statements.length}...\n`,
    );
    const statementPath = resolve(tempDirectory, `statement-${index + 1}.sql`);
    writeFileSync(statementPath, `${statement};\n`, "utf8");
    execFileSync(
      process.execPath,
      [
        corepackJs,
        "pnpm",
        "exec",
        "supabase",
        "db",
        "query",
        "--linked",
        "--file",
        statementPath,
      ],
      {
        cwd: resolve("."),
        stdio: "inherit",
        windowsHide: true,
      },
    );
  }
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
}

process.stdout.write(
  "Remote staging seed complete; no auth.users rows were inserted.\n",
);
