import {
  MappedCustomerQueryService,
  type CustomerReadResult,
} from "@velyq/application";
import type { CustomerMatchDto, CustomerTodayDto } from "@velyq/contracts";
import type { HistoricalQualityDto } from "./customer/historical-quality";
import type { CustomerRawMatch, CustomerRawToday } from "@velyq/database";
import {
  customerDatabaseMapper,
  openDatabaseCustomerQueries,
  type RuntimeCustomerQueries,
} from "./customer-database";
import {
  DatabaseHistoryQueryAdapter,
  type HistoricalDecisionRow,
} from "@velyq/database";
import { customerFixtureMode } from "./api/auth";
import { canonicalMarketDefinitions } from "@velyq/market-semantics";
import { evaluatePriceValidity } from "@velyq/analytics/price-validity";
import {
  diffSnapshots,
  edgePersistence,
  type Snapshot,
} from "@velyq/analytics";
import { customerTodaySnapshot } from "./customer-data";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireCustomerSession } from "./api/auth";
import {
  configuredDataMode,
  resolveCustomerDataSource,
  syntheticDataAllowed,
} from "./data-mode";
import { desc, eq } from "drizzle-orm";
import { subscriptions } from "@velyq/database/schema/private";
import { DatabasePermissionResolver } from "@velyq/database";
import {
  hasPermission,
  resolveEffectiveEntitlements,
  type CustomerEntitlement,
  type CustomerPlan,
  type SubscriptionStatus,
} from "@velyq/auth";
import { openRuntimeDatabaseSession } from "./runtime-database/runtime-database";

type CustomerService = {
  getToday: (asOf: Date) => Promise<
    | {
        ok: true;
        value: CustomerTodayDto;
      }
    | { ok: false; code: "NOT_FOUND" | "UNAVAILABLE"; messageKey: string }
  >;
  getMatch: (
    eventId: string,
    asOf: Date,
  ) => Promise<
    | {
        ok: true;
        value: CustomerMatchDto;
      }
    | { ok: false; code: "NOT_FOUND" | "UNAVAILABLE"; messageKey: string }
  >;
  close(): Promise<void>;
};

const fixtureService: CustomerService = {
  getToday(asOf: Date) {
    return new MappedCustomerQueryService<
      CustomerTodayDto,
      CustomerTodayDto,
      CustomerMatchDto,
      CustomerMatchDto
    >(
      {
        async getToday() {
          return customerTodaySnapshot();
        },
        async getMatch(eventId) {
          return (
            customerTodaySnapshot().matches.find(
              (match) => match.eventId === eventId,
            ) ?? null
          );
        },
      },
      { mapToday: (raw) => raw, mapMatch: (raw) => raw },
    ).getToday(asOf);
  },
  getMatch(eventId: string, asOf: Date) {
    return new MappedCustomerQueryService<
      CustomerTodayDto,
      CustomerTodayDto,
      CustomerMatchDto,
      CustomerMatchDto
    >(
      {
        async getToday() {
          return customerTodaySnapshot();
        },
        async getMatch() {
          return (
            customerTodaySnapshot().matches.find(
              (match) => match.eventId === eventId,
            ) ?? null
          );
        },
      },
      { mapToday: () => customerTodaySnapshot(), mapMatch: (raw) => raw },
    ).getMatch(eventId, asOf);
  },
  async close() {},
};
/* The two application services keep today and match DTO types distinct. */
function mappedDatabaseService(
  runtime: RuntimeCustomerQueries,
): CustomerService {
  const database = runtime.queries;
  const today = new MappedCustomerQueryService<
    CustomerRawToday,
    CustomerTodayDto,
    CustomerRawMatch,
    CustomerMatchDto
  >(database, customerDatabaseMapper);
  const match = new MappedCustomerQueryService<
    CustomerRawToday,
    CustomerTodayDto,
    CustomerRawMatch,
    CustomerMatchDto
  >(database, customerDatabaseMapper);
  return {
    getToday: (asOf: Date) => today.getToday(asOf),
    getMatch: (eventId: string, asOf: Date) => match.getMatch(eventId, asOf),
    close: () => runtime.close(),
  };
}

/**
 * Resolves the customer read service, failing closed in LIVE.
 *
 * The removed branch here is the P0: on a database failure this used to
 * fall through `customerFixtureMode()` into `fixtureService`, so a
 * connectivity fault in a LIVE deployment silently answered with
 * fabricated football (Premier Synthetic League, Northbridge United, a
 * made-up settled-decision history) instead of an outage. A LIVE runtime
 * now has exactly two possible answers -- the real database, or null,
 * which every caller renders as an honest 503. `fixtureService` is
 * unreachable unless the deployment explicitly opted into SYNTHETIC_DEMO.
 *
 * The source decision itself lives in ./data-mode so that the health and
 * readiness endpoints resolve it from the same function rather than
 * re-deriving (and previously contradicting) it.
 */
export async function customerService(): Promise<CustomerService | null> {
  const mode = configuredDataMode();
  if (mode === "SYNTHETIC_DEMO") return fixtureService;

  const runtime = await openDatabaseCustomerQueries();
  const source = resolveCustomerDataSource(mode, runtime !== null);
  if (source === "DATABASE" && runtime) return mappedDatabaseService(runtime);
  if (runtime) await runtime.close();
  return null;
}

export async function loadCustomerToday(
  entitlement: CustomerEntitlement = "today.view",
) {
  const access = await requireCustomerPageAccess(entitlement);
  if (!access) return entitlementRequiredResult();
  const service = await customerService();
  if (!service) return unavailable() as CustomerReadResult<CustomerTodayDto>;
  try {
    const result = await service.getToday(new Date());
    if (entitlement === "edge.preview" || entitlement === "radar.preview") {
      if (result.ok) {
        return {
          ...result,
          value: {
            ...result.value,
            matches: result.value.matches.slice(0, 3),
          },
        };
      }
    }
    return result;
  } finally {
    await service.close();
  }
}

export async function loadCustomerMatch(eventId: string) {
  const access = await requireCustomerPageAccess("match.detail");
  if (!access) return entitlementRequiredResult();
  const service = await customerService();
  if (!service) return unavailable() as CustomerReadResult<CustomerMatchDto>;
  try {
    return await service.getMatch(eventId, new Date());
  } finally {
    await service.close();
  }
}

export type PostMatchAutopsyRow = Readonly<{
  qualityAtDecision: HistoricalQualityDto | null;
  marketLabelKey: string;
  lineValue: string | null;
  selection: string;
  decisionStatus: string;
  whyNotCodes: readonly string[];
  decidedAt: string;
  modelProbability: string | null;
  /** 1/offeredOdds at the moment of decision -- what the market itself
      implied then, derived from the price actually recorded, never a
      separately-stored or fabricated figure. */
  impliedProbabilityAtDecision: string | null;
  fairOdds: string | null;
  offeredOdds: string | null;
  /** What `price-validity.v1` would have required, evaluated against the
      real modelProbability/offeredOdds this decision actually recorded --
      the same shared, versioned policy the live verdict uses, applied to
      history rather than a margin invented here. */
  minimumAcceptableOddsAtDecision: string | null;
  priceValidityPolicyVersion: string;
  outcome: "WIN" | "LOSS" | "VOID" | "UNSETTLED";
  closingOdds: string | null;
  clv: string | null;
}>;

export type PostMatchAutopsyDto = Readonly<{
  finalScore: string;
  rows: readonly PostMatchAutopsyRow[];
}>;

/**
 * Fetches this event's full decision history exactly once. Post-Match
 * Autopsy, Opportunity Lifecycle and What Changed all read the same
 * underlying `listDecisionsForEvent` result -- three separate database
 * round trips for the identical query on one page load was the actual
 * first-cut shape of this (each `loadX` opened its own session), caught in
 * a performance pass. Callers now fetch once here and pass the rows to the
 * three pure `deriveX` functions below, none of which touch the database.
 *
 * Null whenever there is nothing to read: demo mode (the demo corpus has no
 * settlement history to autopsy), or no database session available.
 */
export async function loadEventDecisionHistory(
  eventId: string,
): Promise<readonly HistoricalDecisionRow[] | null> {
  if (customerFixtureMode()) return null;
  const session = await openRuntimeDatabaseSession();
  if (!session) return null;
  try {
    /*
     * The same corpus discipline `DatabaseCustomerQueryAdapter` applies
     * everywhere else: a LIVE read must never be able to answer for a
     * SYNTHETIC_DEMO event id (or the reverse), even by a bare id passed
     * from elsewhere with no prior corpus check of its own.
     */
    return await new DatabaseHistoryQueryAdapter(
      session.database,
    ).listDecisionsForEvent(eventId, configuredDataMode() === "SYNTHETIC_DEMO");
  } finally {
    await session.close();
  }
}

/**
 * A retrospective view of this fixture's own real decisions -- never
 * generated commentary, only the stored reason codes, snapshot numbers and
 * settlement outcome VELYQ already computed. Null whenever nothing has
 * settled yet (a live/pre-match fixture), which is the honest, unremarkable
 * common case, not an error.
 */
export function derivePostMatchAutopsy(
  rows: readonly HistoricalDecisionRow[],
): PostMatchAutopsyDto | null {
  const settled = rows.filter(
    (row) => row.settlement && row.settlement.outcome !== "UNSETTLED",
  );
  if (settled.length === 0) return null;
  const withResult = settled.find((row) => row.result);
  const result = withResult?.result;
  const finalScore =
    result?.homeScore == null || result.awayScore == null
      ? "—"
      : `${result.homeScore}–${result.awayScore}`;
  return {
    finalScore,
    rows: settled.map((row) => {
      const validity = evaluatePriceValidity({
        modelProbability: row.forecast.probability,
        currentOdds: row.decision.offeredOdds,
      });
      return {
        marketLabelKey: row.marketDefinition.labelKey,
        qualityAtDecision: row.qualityAssessment
          ? {
              grade: row.qualityAssessment.grade,
              score: row.qualityAssessment.numericScore,
              assessedAt: row.qualityAssessment.asOf.toISOString(),
              reasonCodes: row.qualityAssessment.reasonCodes,
              policy: row.qualityPolicy,
            }
          : null,
        lineValue: null,
        selection: row.decision.selection,
        decisionStatus: row.decision.status,
        whyNotCodes: row.decision.whyNotCodes,
        decidedAt: row.decision.createdAt.toISOString(),
        modelProbability: row.forecast.probability,
        impliedProbabilityAtDecision: validity.impliedProbability,
        fairOdds: row.decision.fairOdds,
        offeredOdds: row.decision.offeredOdds,
        minimumAcceptableOddsAtDecision: validity.minimumAcceptableOdds,
        priceValidityPolicyVersion: validity.policyVersion,
        outcome: (row.settlement?.outcome ??
          "UNSETTLED") as PostMatchAutopsyRow["outcome"],
        closingOdds: row.settlement?.closingOdds ?? null,
        clv: row.settlement?.clv ?? null,
      };
    }),
  };
}

export type OpportunityLifecycleDto = Readonly<{
  state: "ACTIVE" | "UNSTABLE" | "ENDED";
  firstAppeared: string | null;
  durationMs: number;
  observationCount: number;
  thresholdCrossings: number;
}>;

/**
 * Opportunity Lifecycle: has this fixture's headline selection held a
 * STRONG_EDGE recommendation continuously, or has it flickered? Every
 * decision this codebase ever makes for an outcome is written as its own
 * immutable row (never overwritten) specifically so a real history like
 * this can be read back -- `listDecisionsForEvent` (added for Post-Match
 * Autopsy) already returns every decision for the event; this filters to
 * the ones for the headline market and selection, and feeds the resulting
 * timeline into `edgePersistence` (packages/analytics), which existed fully
 * tested but had no caller anywhere before this.
 *
 * Null whenever no decision has ever been recorded for this selection --
 * the honest state for a fixture the forecast cycle has not reached yet,
 * not an error.
 */
export function deriveOpportunityLifecycle(
  rows: readonly HistoricalDecisionRow[],
  selection: string,
  asOf: Date,
): OpportunityLifecycleDto | null {
  if (!selection) return null;
  const relevant = rows.filter(
    (row) =>
      row.marketDefinition.code ===
        canonicalMarketDefinitions.FOOTBALL_FULL_TIME_1X2.code &&
      row.decision.selection === selection,
  );
  if (relevant.length === 0) return null;
  const observations = relevant.map((row) => ({
    at: row.decision.createdAt.toISOString(),
    active: row.decision.status === "STRONG_EDGE",
  }));
  const result = edgePersistence(observations, asOf.toISOString());
  return {
    state: result.state,
    firstAppeared: result.firstAppeared,
    durationMs: result.durationMs,
    observationCount: result.observationCount,
    thresholdCrossings: result.thresholdCrossings,
  };
}

export type WhatChangedDto = Readonly<{
  firstEvaluatedAt: string;
  lastEvaluatedAt: string;
  changes: readonly Readonly<{
    kind:
      | "PRICE_CHANGED"
      | "MODEL_CHANGED"
      | "LINEUP_CHANGED"
      | "QUALITY_CHANGED"
      | "DECISION_CHANGED"
      | "EDGE_CHANGED"
      | "MARKET_CHANGED";
    before: string | null;
    after: string | null;
  }>[];
}>;

/**
 * What Changed: a factual diff between the first decision VELYQ ever
 * recorded for this selection and the latest one -- price, model
 * probability, decision status, expected value. Built from the same
 * decision history `loadOpportunityLifecycle` reads, through
 * `diffSnapshots` (packages/analytics), which existed fully tested with no
 * caller anywhere.
 *
 * Deliberately narrower than `diffSnapshots`'s full seven-field `Snapshot`:
 * a decision row does not carry the lineup state or quality grade that was
 * in effect when IT was written (those live on separate assessment rows
 * this query does not join), so `lineup`/`quality` are held constant across
 * both snapshots here rather than guessed -- reporting a change we cannot
 * actually verify would be worse than omitting it. `market` is included
 * genuinely (both snapshots are the same market by construction, so it
 * never fires, which is correct).
 *
 * Null when fewer than two decisions exist for this selection -- nothing
 * has had the chance to change yet.
 */
export function deriveWhatChanged(
  rows: readonly HistoricalDecisionRow[],
  selection: string,
): WhatChangedDto | null {
  if (!selection) return null;
  const relevant = rows
    .filter(
      (row) =>
        row.marketDefinition.code ===
          canonicalMarketDefinitions.FOOTBALL_FULL_TIME_1X2.code &&
        row.decision.selection === selection,
    )
    .sort(
      (a, b) => a.decision.createdAt.getTime() - b.decision.createdAt.getTime(),
    );
  if (relevant.length < 2) return null;
  const first = relevant[0]!;
  const last = relevant.at(-1)!;
  const toSnapshot = (row: (typeof relevant)[number]): Snapshot => ({
    at: row.decision.createdAt.toISOString(),
    price: row.decision.offeredOdds,
    modelProbability: row.forecast.probability,
    lineup: "unknown",
    quality: "unknown",
    decision: row.decision.status,
    edge: row.decision.expectedValue,
    market: row.marketDefinition.code,
  });
  const changes = diffSnapshots(toSnapshot(first), toSnapshot(last));
  return {
    firstEvaluatedAt: first.decision.createdAt.toISOString(),
    lastEvaluatedAt: last.decision.createdAt.toISOString(),
    changes: changes.map((change) => ({
      kind: change.kind,
      before: change.before,
      after: change.after,
    })),
  };
}

/**
 * Resolves who the customer is and what they are entitled to, from a cookie
 * header alone.
 *
 * Split out from `loadCustomerContext` so a route handler can use it: the
 * page version gates through `requireCustomerPageAccess`, which redirects to
 * /sign-in on an unauthenticated request. A redirect is the right answer for
 * a page and the wrong one for an API, which must answer 401 and let the
 * caller decide.
 */
export async function resolveCustomerContext(cookieHeader: string) {
  const token = cookieHeader.match(/(?:^|; )velyq_access_token=([^;]+)/)?.[1];
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  if (!token || !url || !key) return null;
  const identity = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!identity.ok) return null;
  const user = (await identity.json()) as { id?: string; email?: string };
  if (!user.id) return null;
  const session = await openRuntimeDatabaseSession();
  if (!session)
    /*
     * The same no-database affordance `requireCustomerSession` already has,
     * and gated on the same explicit opt-in.
     *
     * Without it the two halves disagreed: authorization admitted a demo
     * visitor as FREE, and then this returned null, so
     * /api/v1/customer/context answered 503 and Account was unusable in
     * SYNTHETIC_DEMO -- the one mode whose whole purpose is running without
     * a database. LIVE still returns null here, which the route turns into
     * an honest 503 rather than an invented identity.
     *
     * Nothing is fabricated beyond the tier: the email is the authenticated
     * identity the provider just confirmed, the plan is FREE, and isAdmin is
     * false because administrative access is a database fact and there is no
     * database to assert it.
     */
    return syntheticDataAllowed()
      ? {
          email: user.email ?? "",
          plan: "FREE" as const,
          status: null,
          entitlements: resolveEffectiveEntitlements(
            { plan: "FREE", status: null },
            null,
          ).entitlements,
          isAdmin: false,
        }
      : null;
  try {
    const principal = await new DatabasePermissionResolver(
      session.database,
    ).resolve(user.id);
    const rows = await session.database
      .select({ plan: subscriptions.planCode, status: subscriptions.status })
      .from(subscriptions)
      .where(eq(subscriptions.userId, user.id))
      .orderBy(desc(subscriptions.stripeEventCreatedAt), desc(subscriptions.id))
      .limit(1);
    const current = rows[0];
    const plan: CustomerPlan =
      current?.plan === "PRO" || current?.plan === "ELITE"
        ? current.plan
        : "FREE";
    const status =
      current?.status &&
      [
        "active",
        "trialing",
        "past_due",
        "canceled",
        "unpaid",
        "incomplete",
        "incomplete_expired",
        "paused",
      ].includes(current.status)
        ? (current.status as SubscriptionStatus)
        : null;
    const resolved = resolveEffectiveEntitlements({ plan, status }, principal);
    return {
      email: user.email ?? "",
      plan: resolved.plan,
      status: resolved.subscriptionStatus,
      entitlements: resolved.entitlements,
      isAdmin: hasPermission(principal, "admin.access"),
    };
  } finally {
    await session.close();
  }
}

export async function loadCustomerContext() {
  const access = await requireCustomerPageAccess("today.view");
  if (!access) return null;
  return resolveCustomerContext((await cookies()).toString());
}

async function requireCustomerPageAccess(entitlement: CustomerEntitlement) {
  /*
   * The unauthenticated-preview shortcut is a SYNTHETIC_DEMO affordance
   * only: it lets a demo deployment with no database render the fixture
   * without a session. Reached in LIVE it would have been an outright
   * authentication bypass on a database fault, so it is now gated on the
   * explicit opt-in rather than on `customerFixtureMode()`'s former
   * platform inference.
   */
  if (syntheticDataAllowed()) {
    const runtime = await openDatabaseCustomerQueries();
    if (!runtime) return true;
    await runtime.close();
  }
  const cookieHeader = (await cookies()).toString();
  const request = new Request("https://velyq.local/customer", {
    headers: { cookie: cookieHeader },
  });
  const denied = await requireCustomerSession(request, entitlement);
  if (!denied) return true;
  if (denied.status === 401) redirect("/sign-in");
  return false;
}

function entitlementRequiredResult() {
  return {
    ok: false as const,
    code: "ENTITLEMENT_REQUIRED" as const,
    messageKey: "entitlementRequired",
  };
}

export function unavailable(requestId: string = crypto.randomUUID()) {
  return {
    ok: false as const,
    code: "UNAVAILABLE" as const,
    messageKey: "customerUnavailable",
    type: "https://velyq.dev/problems/customer-unavailable",
    title: "Customer data is temporarily unavailable",
    status: 503 as const,
    requestId,
  };
}

export async function customerOddsHistory(
  eventId: string,
  outcomeId: string | null,
  asOf: Date,
) {
  const runtime = await openDatabaseCustomerQueries();
  if (runtime) {
    try {
      if (!outcomeId) return { ambiguous: true as const };
      return await runtime.queries.getOddsHistory(eventId, outcomeId, asOf);
    } catch {
      return { unavailable: true as const };
    } finally {
      await runtime.close();
    }
  }
  return null;
}
