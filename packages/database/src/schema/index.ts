import { adminAuditEvents } from "./audit.js";
import {
  competitionIdentities,
  competitionPolicies,
  competitionPolicyVersions,
  competitionProviderCoverage,
  competitions,
  eventParticipants,
  events,
  participants,
  sports,
} from "./catalog.js";
import {
  calibrationVersions,
  dataQualityAssessments,
  dataQualityPolicyVersions,
  decisionFunnelRuns,
  lineupObservations,
  modelArtifacts,
  modelDefinitions,
  modelVersions,
  predictionInputs,
  predictionRuns,
  predictions,
  radarEvidence,
  scoreDefinitionVersions,
  scoreResults,
} from "./intelligence.js";
import {
  bookmakers,
  eventMarketOutcomes,
  eventMarkets,
  marketDefinitions,
  oddsObservations,
  outcomeDefinitions,
  providerMarketMappings,
} from "./market.js";
import {
  jobs,
  lineupRequestLog,
  providerPolicyVersions,
  providerSyncRuns,
  providers,
  sourceObservations,
} from "./operations.js";
import { permissions, rolePermissions, roles, userRoles } from "./private.js";
import { profiles } from "./public.js";
import {
  dataSources,
  imports,
  mappingQuarantine,
  matchOdds,
  matches,
} from "./research.js";

export * from "./audit.js";
export * from "./catalog.js";
export * from "./intelligence.js";
export * from "./market.js";
export * from "./operations.js";
export * from "./private.js";
export * from "./public.js";
export * from "./research.js";
export * from "./schemas.js";

/**
 * Every table the application owns, in one reviewed allowlist.
 *
 * Named for the phase that introduced it; it has always been the full set
 * rather than a phase-scoped subset, and `schema-allowlist.test.ts` pins it so
 * that adding a table is a deliberate, reviewed edit rather than a side effect.
 */
export const phaseOneTables = [
  adminAuditEvents,
  competitionIdentities,
  competitionPolicies,
  competitionPolicyVersions,
  competitionProviderCoverage,
  competitions,
  eventParticipants,
  events,
  participants,
  sports,
  calibrationVersions,
  dataQualityAssessments,
  dataQualityPolicyVersions,
  decisionFunnelRuns,
  lineupObservations,
  modelArtifacts,
  modelDefinitions,
  modelVersions,
  predictionInputs,
  predictionRuns,
  predictions,
  radarEvidence,
  scoreDefinitionVersions,
  scoreResults,
  bookmakers,
  eventMarketOutcomes,
  eventMarkets,
  marketDefinitions,
  oddsObservations,
  outcomeDefinitions,
  providerMarketMappings,
  jobs,
  lineupRequestLog,
  providerPolicyVersions,
  providerSyncRuns,
  providers,
  sourceObservations,
  permissions,
  rolePermissions,
  roles,
  userRoles,
  profiles,
  dataSources,
  imports,
  matches,
  matchOdds,
  mappingQuarantine,
] as const;

export { databaseSchema } from "./database.js";
