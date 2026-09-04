import { adminAuditEvents } from "./audit.js";
import {
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
  lineupObservations,
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
  providerPolicyVersions,
  providerSyncRuns,
  providers,
  sourceObservations,
} from "./operations.js";
import { permissions, rolePermissions, roles, userRoles } from "./private.js";
import { profiles } from "./public.js";

export * from "./audit.js";
export * from "./catalog.js";
export * from "./intelligence.js";
export * from "./market.js";
export * from "./operations.js";
export * from "./private.js";
export * from "./public.js";
export * from "./schemas.js";

export const phaseOneTables = [
  adminAuditEvents,
  competitions,
  eventParticipants,
  events,
  participants,
  sports,
  calibrationVersions,
  dataQualityAssessments,
  dataQualityPolicyVersions,
  lineupObservations,
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
  providerPolicyVersions,
  providerSyncRuns,
  providers,
  sourceObservations,
  permissions,
  rolePermissions,
  roles,
  userRoles,
  profiles,
] as const;

export const databaseSchema = {
  adminAuditEvents,
  bookmakers,
  calibrationVersions,
  competitions,
  dataQualityAssessments,
  dataQualityPolicyVersions,
  eventMarketOutcomes,
  eventMarkets,
  eventParticipants,
  events,
  jobs,
  lineupObservations,
  marketDefinitions,
  modelDefinitions,
  modelVersions,
  oddsObservations,
  outcomeDefinitions,
  participants,
  permissions,
  predictionInputs,
  predictionRuns,
  predictions,
  profiles,
  providerMarketMappings,
  providerPolicyVersions,
  providerSyncRuns,
  providers,
  radarEvidence,
  rolePermissions,
  roles,
  scoreDefinitionVersions,
  scoreResults,
  sourceObservations,
  sports,
  userRoles,
} as const;
