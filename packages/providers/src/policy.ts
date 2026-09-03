import type {
  PolicyDecision,
  ProviderAction,
  ProviderAudience,
  ProviderDataCategory,
  ProviderDataPolicy,
  ProviderEnvironment,
} from "@velyq/contracts";
import { z } from "zod";

import { isoTimestampSchema } from "./schemas.js";

const providerActionSchema = z.enum([
  "RETAIN_RAW",
  "RETAIN_NORMALIZED",
  "DISPLAY",
  "EXPORT",
  "CACHE",
  "MODEL_TRAINING",
  "BACKTEST",
  "REPLAY",
]);
const providerAudienceSchema = z.enum(["CUSTOMER", "ADMIN", "PUBLIC"]);
const providerEnvironmentSchema = z.enum(["DEVELOPMENT", "TEST", "PRODUCTION"]);
const providerDataCategorySchema = z.enum([
  "REPOSITORY_FIXTURE",
  "NORMALIZED_FIXTURE",
  "NORMALIZED_ODDS",
  "NORMALIZED_LINEUP",
]);

export const providerDataPolicySchema = z
  .object({
    providerCode: z.string().min(1),
    version: z.string().min(1),
    providerMode: z.literal("SYNTHETIC"),
    effectiveFrom: isoTimestampSchema,
    effectiveTo: isoTimestampSchema.nullable(),
    grants: z
      .array(
        z
          .object({
            action: providerActionSchema,
            environments: z.array(providerEnvironmentSchema).min(1),
            territories: z.array(z.string().length(2)).min(1),
            dataCategories: z.array(providerDataCategorySchema).min(1),
            audiences: z.array(providerAudienceSchema).min(1).optional(),
            requiredAttribution: z.boolean(),
            retentionDays: z.number().int().positive().optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((policy, context) => {
    if (
      policy.effectiveTo !== null &&
      policy.effectiveTo <= policy.effectiveFrom
    ) {
      context.addIssue({
        code: "custom",
        message: "effectiveTo must be later than effectiveFrom",
        path: ["effectiveTo"],
      });
    }
  });

type ParseResult<T> =
  | Readonly<{ readonly ok: true; readonly value: T }>
  | Readonly<{
      readonly ok: false;
      readonly error: Readonly<{
        readonly code: "INVALID_PROVIDER_POLICY";
        readonly issues: readonly string[];
      }>;
    }>;

export function parseProviderDataPolicy(
  input: unknown,
): ParseResult<ProviderDataPolicy> {
  const parsed = providerDataPolicySchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "INVALID_PROVIDER_POLICY",
        issues: parsed.error.issues.map((issue) => issue.message),
      },
    };
  }

  return {
    ok: true,
    value: {
      providerCode: parsed.data.providerCode,
      version: parsed.data.version,
      providerMode: parsed.data.providerMode,
      effectiveFrom: parsed.data.effectiveFrom,
      effectiveTo: parsed.data.effectiveTo,
      grants: parsed.data.grants.map((grant) => ({
        action: grant.action,
        environments: grant.environments,
        territories: grant.territories,
        dataCategories: grant.dataCategories,
        requiredAttribution: grant.requiredAttribution,
        ...(grant.audiences === undefined
          ? {}
          : { audiences: grant.audiences }),
        ...(grant.retentionDays === undefined
          ? {}
          : { retentionDays: grant.retentionDays }),
      })),
    },
  };
}

export type ProviderActionRequest = Readonly<{
  readonly action: ProviderAction;
  readonly asOf: string;
  readonly environment: ProviderEnvironment;
  readonly territory: string;
  readonly dataCategory: ProviderDataCategory;
  readonly audience?: ProviderAudience;
  readonly attributionPresent: boolean;
}>;

function denied(
  policy: ProviderDataPolicy,
  reason: Extract<PolicyDecision, { allowed: false }>["reason"],
): PolicyDecision {
  return { allowed: false, policyVersion: policy.version, reason };
}

export function evaluateProviderAction(
  policy: ProviderDataPolicy,
  request: ProviderActionRequest,
): PolicyDecision {
  const parsedAsOf = isoTimestampSchema.safeParse(request.asOf);
  if (
    !parsedAsOf.success ||
    request.asOf < policy.effectiveFrom ||
    (policy.effectiveTo !== null && request.asOf >= policy.effectiveTo)
  ) {
    return denied(policy, "POLICY_NOT_EFFECTIVE");
  }

  const actionGrants = policy.grants.filter(
    ({ action }) => action === request.action,
  );
  if (actionGrants.length === 0) return denied(policy, "ACTION_NOT_GRANTED");

  const audienceGrants = actionGrants.filter(
    ({ audiences }) =>
      audiences === undefined ||
      (request.audience !== undefined && audiences.includes(request.audience)),
  );
  if (audienceGrants.length === 0)
    return denied(policy, "AUDIENCE_NOT_GRANTED");

  const environmentGrants = audienceGrants.filter(({ environments }) =>
    environments.includes(request.environment),
  );
  if (environmentGrants.length === 0)
    return denied(policy, "ENVIRONMENT_NOT_GRANTED");

  const territoryGrants = environmentGrants.filter(({ territories }) =>
    territories.includes(request.territory),
  );
  if (territoryGrants.length === 0)
    return denied(policy, "TERRITORY_NOT_GRANTED");

  const categoryGrants = territoryGrants.filter(({ dataCategories }) =>
    dataCategories.includes(request.dataCategory),
  );
  if (categoryGrants.length === 0)
    return denied(policy, "DATA_CATEGORY_NOT_GRANTED");

  if (
    !request.attributionPresent &&
    categoryGrants.every(({ requiredAttribution }) => requiredAttribution)
  ) {
    return denied(policy, "ATTRIBUTION_REQUIRED");
  }

  return { allowed: true, policyVersion: policy.version };
}

const sharedGrantConstraints = {
  environments: ["DEVELOPMENT", "TEST"] as const,
  territories: ["ZZ"] as const,
  requiredAttribution: true,
};

export const syntheticProviderPolicyDocument = Object.freeze({
  providerCode: "SYNTHETIC_FIXTURES",
  version: "synthetic-fixtures.v1",
  providerMode: "SYNTHETIC",
  effectiveFrom: "2026-01-01T00:00:00Z",
  effectiveTo: null,
  grants: [
    {
      action: "RETAIN_NORMALIZED",
      ...sharedGrantConstraints,
      dataCategories: [
        "NORMALIZED_FIXTURE",
        "NORMALIZED_ODDS",
        "NORMALIZED_LINEUP",
      ],
      retentionDays: 3650,
    },
    {
      action: "DISPLAY",
      ...sharedGrantConstraints,
      audiences: ["CUSTOMER", "ADMIN"],
      dataCategories: [
        "NORMALIZED_FIXTURE",
        "NORMALIZED_ODDS",
        "NORMALIZED_LINEUP",
      ],
    },
    {
      action: "REPLAY",
      ...sharedGrantConstraints,
      dataCategories: ["REPOSITORY_FIXTURE"],
    },
    {
      action: "CACHE",
      ...sharedGrantConstraints,
      dataCategories: ["REPOSITORY_FIXTURE"],
      retentionDays: 3650,
    },
    {
      action: "BACKTEST",
      ...sharedGrantConstraints,
      dataCategories: ["NORMALIZED_ODDS"],
    },
  ],
} satisfies ProviderDataPolicy);
