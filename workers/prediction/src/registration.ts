import { and, eq } from "drizzle-orm";
import {
  calibrationVersions,
  competitionIdentities,
  competitionPolicies,
  competitionPolicyVersions,
  modelArtifacts,
  modelDefinitions,
  modelVersions,
  sports,
  type PrivilegedVelyqDatabase,
} from "@velyq/database";
import {
  API_SPORTS_COMPETITIONS,
  COMPETITION_POLICY_VERSION,
  FOOTBALL_COMPETITION_POLICY,
  FOOTBALL_DATA_DIVISIONS,
  type ModelArtifact,
} from "@velyq/research";
import { TEMPERATURE_CALIBRATION_VERSION } from "./pre-event-cycle.js";

/**
 * Registers a trained artifact and materialises the competition policy.
 *
 * Registration is a separate, deliberate step from training. A model that
 * appears in the database the moment it is fitted has no reviewable boundary
 * between "we tried something" and "production may use this", and the
 * maturity recorded here is the only thing standing between an EXPERIMENTAL
 * fit and a customer recommendation.
 *
 * Everything is idempotent by version: re-registering the same artifact is a
 * no-op, and a genuinely new fit gets a new `model_versions` row rather than
 * overwriting the one a stored prediction cites.
 */

const FOOTBALL_SPORT_CODE = "FOOTBALL";

export type RegistrationResult = Readonly<{
  modelDefinitionId: string;
  modelVersionId: string;
  calibrationVersionId: string;
  artifactId: string | null;
  artifactReference: string;
  maturity: string;
  alreadyRegistered: boolean;
  policyVersionId: string;
  competitionPolicies: number;
  competitionIdentities: number;
}>;

export async function registerModelArtifact(
  options: Readonly<{
    database: PrivilegedVelyqDatabase;
    artifact: ModelArtifact;
    artifactReference: string;
  }>,
): Promise<RegistrationResult> {
  const { database, artifact } = options;

  const [definition] = await database
    .select({ id: modelDefinitions.id })
    .from(modelDefinitions)
    .where(eq(modelDefinitions.code, artifact.modelCode))
    .limit(1);
  if (!definition)
    /*
     * Provisioned by migration, not created here. A definition invented at
     * registration time would mean the set of models production knows about
     * depends on which script last ran.
     */
    throw new Error(`MODEL_DEFINITION_MISSING:${artifact.modelCode}`);

  const existingVersion = await database
    .select({ id: modelVersions.id })
    .from(modelVersions)
    .where(
      and(
        eq(modelVersions.modelDefinitionId, definition.id),
        eq(modelVersions.version, artifact.version),
      ),
    )
    .limit(1);

  const modelVersionId =
    existingVersion[0]?.id ??
    (
      await database
        .insert(modelVersions)
        .values({
          modelDefinitionId: definition.id,
          version: artifact.version,
          maturityStatus: artifact.maturity,
          /*
           * The model has been backtested but not forward-tested, and the
           * two are different claims. `validationStatus` records the former;
           * `maturityStatus` is what the decision gates read.
           */
          validationStatus: "BACKTESTED_NOT_FORWARD_TESTED",
          featureContractVersion: artifact.featureContractVersion,
          artifactReference: options.artifactReference,
        })
        .returning({ id: modelVersions.id })
    )[0]!.id;

  const existingCalibration = await database
    .select({ id: calibrationVersions.id })
    .from(calibrationVersions)
    .where(
      and(
        eq(calibrationVersions.modelVersionId, modelVersionId),
        eq(calibrationVersions.version, TEMPERATURE_CALIBRATION_VERSION),
      ),
    )
    .limit(1);
  const calibrationVersionId =
    existingCalibration[0]?.id ??
    (
      await database
        .insert(calibrationVersions)
        .values({
          modelVersionId,
          version: TEMPERATURE_CALIBRATION_VERSION,
          method: "TEMPERATURE_SCALING",
          /*
           * All three market calibrators in one row, because the database
           * models one calibration per model version while the artifact
           * calibrates each market separately — a market that turned out
           * well calibrated carries a temperature of exactly 1 rather than
           * being absent.
           */
          parameters: { markets: artifact.calibrators },
          validationStatus: "FITTED_ON_WALK_FORWARD_VALIDATION",
        })
        .returning({ id: calibrationVersions.id })
    )[0]!.id;

  const existingArtifact = await database
    .select({ id: modelArtifacts.id })
    .from(modelArtifacts)
    .where(eq(modelArtifacts.artifactReference, options.artifactReference))
    .limit(1);
  const artifactRow =
    existingArtifact[0] ??
    (
      await database
        .insert(modelArtifacts)
        .values({
          modelVersionId,
          artifactReference: options.artifactReference,
          trainingDatasetFingerprint: artifact.trainingDatasetFingerprint,
          trainingCutoff: new Date(`${artifact.trainingCutoff}T00:00:00Z`),
          parameters: artifact.parameters,
          calibrators: artifact.calibrators,
          uncertaintyProfiles: artifact.uncertaintyProfiles,
          validationReport: artifact.validationReport,
        })
        .onConflictDoNothing()
        .returning({ id: modelArtifacts.id })
    )[0] ??
    null;

  const policy = await materialiseCompetitionPolicy(database);

  return {
    modelDefinitionId: definition.id,
    modelVersionId,
    calibrationVersionId,
    artifactId: artifactRow?.id ?? null,
    artifactReference: options.artifactReference,
    maturity: artifact.maturity,
    alreadyRegistered: existingArtifact.length > 0,
    ...policy,
  };
}

/**
 * Writes the code-defined competition policy into the database.
 *
 * The code stays the single source of truth and the tables are a
 * materialisation of it, rather than the other way around: a policy that
 * lives only in rows can be edited into a state no reviewer ever saw, and a
 * policy that lives only in code cannot be joined against an event in a
 * query. Versioned, so an existing version is never rewritten.
 */
export async function materialiseCompetitionPolicy(
  database: PrivilegedVelyqDatabase,
): Promise<
  Readonly<{
    policyVersionId: string;
    competitionPolicies: number;
    competitionIdentities: number;
  }>
> {
  const [sport] = await database
    .select({ id: sports.id })
    .from(sports)
    .where(eq(sports.code, FOOTBALL_SPORT_CODE))
    .limit(1);
  if (!sport) throw new Error("FOOTBALL_SPORT_MISSING");

  const existing = await database
    .select({ id: competitionPolicyVersions.id })
    .from(competitionPolicyVersions)
    .where(eq(competitionPolicyVersions.version, COMPETITION_POLICY_VERSION))
    .limit(1);
  const policyVersionId =
    existing[0]?.id ??
    (
      await database
        .insert(competitionPolicyVersions)
        .values({
          version: COMPETITION_POLICY_VERSION,
          definition: {
            source: "@velyq/research FOOTBALL_COMPETITION_POLICY",
            entries: FOOTBALL_COMPETITION_POLICY.length,
          },
          effectiveFrom: new Date(),
        })
        .returning({ id: competitionPolicyVersions.id })
    )[0]!.id;

  let policyRows = 0;
  for (const entry of FOOTBALL_COMPETITION_POLICY) {
    const inserted = await database
      .insert(competitionPolicies)
      .values({
        policyVersionId,
        sportId: sport.id,
        canonicalCode: entry.canonicalCode,
        displayName: entry.displayName,
        countryCode: entry.countryCode.slice(0, 2),
        tier: entry.tier,
        state: entry.state,
        modelEligible: entry.modelEligible,
        customerVisible: entry.customerVisible,
        minHistoricalSample: entry.minHistoricalSample,
        minBookmakerCoverage: entry.minBookmakerCoverage,
        manualOverride: null,
        overrideReason: null,
        reasonCodes: [...entry.reasonCodes],
      })
      .onConflictDoNothing()
      .returning({ id: competitionPolicies.id });
    policyRows += inserted.length;
  }

  let identityRows = 0;
  for (const [division, canonicalCode] of Object.entries(
    FOOTBALL_DATA_DIVISIONS,
  )) {
    const inserted = await database
      .insert(competitionIdentities)
      .values({
        canonicalCode,
        sourceCode: "FOOTBALL_DATA_UK",
        sourceKey: division,
        sourceName: division,
        countryCode:
          FOOTBALL_COMPETITION_POLICY.find(
            (entry) => entry.canonicalCode === canonicalCode,
          )?.countryCode.slice(0, 2) ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: competitionIdentities.id });
    identityRows += inserted.length;
  }
  for (const entry of API_SPORTS_COMPETITIONS) {
    const inserted = await database
      .insert(competitionIdentities)
      .values({
        canonicalCode: entry.canonicalCode,
        sourceCode: "API_SPORTS",
        /*
         * Keyed by the normalized name plus country, because that is all the
         * fixture normaliser currently carries into the catalog and a name
         * alone is ambiguous across countries.
         */
        sourceKey: `${entry.name}|${entry.countryCode}`,
        sourceName: entry.name,
        countryCode: entry.countryCode.slice(0, 2),
      })
      .onConflictDoNothing()
      .returning({ id: competitionIdentities.id });
    identityRows += inserted.length;
  }

  return {
    policyVersionId,
    competitionPolicies: policyRows,
    competitionIdentities: identityRows,
  };
}
