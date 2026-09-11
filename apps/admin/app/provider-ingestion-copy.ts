import type { MessageKey, Translator } from "@velyq/ui";
import type { AdminProviderIngestionRunDto } from "./admin-api";

type RunHealth = AdminProviderIngestionRunDto["runHealth"];
type RunStatus = AdminProviderIngestionRunDto["status"];
type ResultOutcome = AdminProviderIngestionRunDto["resultOutcome"];
type RunTrigger = AdminProviderIngestionRunDto["trigger"];

const healthKeys = {
  RUNNING: "adminRunHealthRunning",
  HEALTHY_IDLE: "adminRunHealthHealthyIdle",
  HEALTHY_ACTIVE: "adminRunHealthHealthyActive",
  COMPLETED_WITH_ERRORS: "adminRunHealthCompletedWithErrors",
  QUOTA_BLOCKED: "adminRunHealthQuotaBlocked",
  BUDGET_BLOCKED: "adminRunHealthBudgetBlocked",
  WORK_BLOCKED: "adminRunHealthWorkBlocked",
  FAILED: "adminRunHealthFailed",
} as const satisfies Record<RunHealth, MessageKey>;

const statusKeys = {
  RUNNING: "adminRunStatusRunning",
  COMPLETED: "adminRunStatusCompleted",
  FAILED: "adminRunStatusFailed",
} as const satisfies Record<RunStatus, MessageKey>;

const resultKeys = {
  NOT_ATTEMPTED: "adminResultNotAttempted",
  SUCCEEDED: "adminResultSucceeded",
  FAILED: "adminResultFailed",
} as const satisfies Record<ResultOutcome, MessageKey>;

const triggerKeys = {
  SCHEDULER: "adminTriggerScheduler",
  MANUAL: "adminTriggerManual",
} as const satisfies Record<RunTrigger, MessageKey>;

export function runHealthLabel(t: Translator, value: RunHealth) {
  return t(healthKeys[value]);
}

export function runHealthTone(value: RunHealth) {
  if (value === "HEALTHY_IDLE" || value === "HEALTHY_ACTIVE")
    return "completed" as const;
  if (value === "RUNNING" || value.endsWith("_BLOCKED"))
    return "running" as const;
  return "failed" as const;
}

export function runStatusLabel(t: Translator, value: RunStatus) {
  return t(statusKeys[value]);
}

export function resultOutcomeLabel(t: Translator, value: ResultOutcome) {
  return t(resultKeys[value]);
}

export function runTriggerLabel(t: Translator, value: RunTrigger) {
  return t(triggerKeys[value]);
}

export function quotaStateLabel(t: Translator, value: string | null) {
  const key =
    value === "HEALTHY"
      ? "adminQuotaHealthy"
      : value === "CONSERVE"
        ? "adminQuotaConserve"
        : value === "CRITICAL"
          ? "adminQuotaCritical"
          : value === "EXHAUSTED"
            ? "adminQuotaExhausted"
            : "adminQuotaUnknown";
  return t(key);
}
