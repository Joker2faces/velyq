import { createPrivilegedDatabaseClient } from "../../packages/database/src/client.js";
import {
  diagnoseIdentityAnomalies,
  remediateIdentityAnomalies,
} from "../../packages/database/src/maintenance/identity-remediation.js";

function integerFlag(name: string): number {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} requires a non-negative integer`);
  }
  return parsed;
}

const apply = process.argv.includes("--apply");
const authorizeProduction = process.argv.includes(
  "--authorize-production-write",
);
const connectionString =
  process.env["VELYQ_DATABASE_DIRECT_URL"] ?? process.env["DATABASE_URL"];

if (!connectionString) {
  throw new Error("Set VELYQ_DATABASE_DIRECT_URL or DATABASE_URL");
}
if (apply && !authorizeProduction) {
  throw new Error(
    "Applying requires the explicit --authorize-production-write safety flag",
  );
}

const client = createPrivilegedDatabaseClient({ connectionString });
try {
  const before = await diagnoseIdentityAnomalies(client.pool);
  const result = await remediateIdentityAnomalies(client.pool, {
    dryRun: !apply,
    expectedEventRepairs: integerFlag("--expected-event-repairs"),
    expectedCompetitionDemotions: integerFlag(
      "--expected-competition-demotions",
    ),
  });
  const after = await diagnoseIdentityAnomalies(client.pool);
  console.log(JSON.stringify({ before, result, after }, null, 2));
} finally {
  await client.close();
}
