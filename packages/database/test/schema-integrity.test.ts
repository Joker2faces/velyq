import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { eventMarketOutcomes, jobs } from "../src/schema/index.js";

describe("Drizzle integrity contracts", () => {
  it("models durable job causation, retry bounds, statuses, and lease states", () => {
    const config = getTableConfig(jobs);
    const columns = config.columns.map((column) => column.name);
    const causation = config.columns.find(
      (column) => column.name === "causation_id",
    );
    const checks = config.checks.map((constraint) => constraint.name);

    expect(columns).toContain("causation_id");
    expect(causation?.notNull).toBe(true);
    expect(checks).toEqual(
      expect.arrayContaining([
        "jobs_attempt_count_nonnegative_check",
        "jobs_max_attempts_positive_check",
        "jobs_attempt_count_within_max_check",
        "jobs_status_check",
        "jobs_state_check",
      ]),
    );
  });

  it("indexes the full event-outcome composite foreign-key identity", () => {
    const config = getTableConfig(eventMarketOutcomes);
    const marketDefinitionColumn = config.columns.find(
      (column) => column.name === "market_definition_id",
    );
    const compositeIndex = config.indexes.find(
      (candidate) =>
        candidate.config.name ===
        "event_market_outcomes_definition_outcome_idx",
    );

    expect(marketDefinitionColumn?.notNull).toBe(true);
    expect(
      compositeIndex?.config.columns.map((column) =>
        "name" in column ? column.name : undefined,
      ),
    ).toEqual(["market_definition_id", "outcome_definition_id"]);
  });
});
