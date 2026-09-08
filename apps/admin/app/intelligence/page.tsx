import { AdminGate, AdminShell, getAdminContext } from "../admin-page";

export const dynamic = "force-dynamic";
const metricLabels = {
  fixturesDiscovered: "Fixtures discovered",
  competitionMapped: "Competition mapped",
  teamsResolved: "Teams resolved",
  modelSupported: "Model supported",
  forecastGenerated: "Forecast generated",
  oddsAvailable: "Odds available",
  decisionEvaluated: "Decision evaluated",
  edge: "EDGE",
  watch: "WATCH",
  noBet: "NO BET",
  waitForLineup: "WAIT FOR LINEUP",
  insufficientData: "INSUFFICIENT DATA",
} as const;

export default async function IntelligencePage() {
  const { runtime } = await getAdminContext("admin.access");
  if (!runtime)
    return (
      <AdminGate
        kicker="Intelligence operations"
        title="Admin authorization required"
        body="Sign in with an authorized administrator account."
      />
    );
  try {
    const data = await runtime.queries.getIntelligenceOverview();
    return (
      <AdminShell active="/intelligence">
        <div className="ops-page">
          <div className="ops-page__head">
            <div className="ops-page__head-copy">
              <p className="eyebrow">Intelligence funnel</p>
              <h1>Forecast coverage and results</h1>
              <p>
                Observed counts from persisted records. No inferred or synthetic
                operational metrics.
              </p>
            </div>
          </div>
          <section className="panel">
            <div className="panel-heading">
              <h2>Today’s forecast funnel</h2>
            </div>
            <div className="ops-metrics">
              {Object.entries(metricLabels).map(([key, label]) => (
                <div className="ops-metric" key={key}>
                  <span className="ops-metric__label">{label}</span>
                  <span className="ops-metric__value">
                    {data[key as keyof typeof metricLabels]}
                  </span>
                </div>
              ))}
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Primary blockers</h2>
            </div>
            {Object.keys(data.blockers).length ? (
              <div className="ops-metrics">
                {Object.entries(data.blockers).map(([code, count]) => (
                  <div className="ops-metric" key={code}>
                    <span className="ops-metric__label">{code}</span>
                    <span className="ops-metric__value">{count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="state">
                <h3>No persisted blocker codes today</h3>
              </div>
            )}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Result and settlement operations</h2>
            </div>
            <div className="ops-metrics">
              {[
                ["Awaiting result", data.eventsAwaitingResult],
                ["Final results", data.finalResultsReceived],
                ["Settlements pending", data.settlementsPending],
                ["Settlements completed", data.settlementsCompleted],
                ["Result failures", data.resultIngestionFailures],
                ["Unsettled actionable", data.unsettledActionableDecisions],
              ].map(([label, value]) => (
                <div className="ops-metric" key={String(label)}>
                  <span className="ops-metric__label">{label}</span>
                  <span className="ops-metric__value">{value}</span>
                </div>
              ))}
            </div>
            <p>
              Last successful result sync:{" "}
              {data.lastSuccessfulResultSync ?? "Never"} · Last settlement:{" "}
              {data.lastSettlementRun ?? "Never"}
            </p>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Model health</h2>
            </div>
            {data.modelHealth.length ? (
              data.modelHealth.map((model) => (
                <div className="ops-metric" key={model.modelVersion}>
                  <span className="ops-metric__label">
                    {model.modelVersion}
                  </span>
                  <span className="ops-metric__value">
                    {model.status === "INSUFFICIENT_SAMPLE"
                      ? "INSUFFICIENT SAMPLE"
                      : `Brier ${model.brierScore?.toFixed(4)} · Log loss ${model.logLoss?.toFixed(4)}`}
                  </span>
                  <span className="ops-metric__note">
                    Sample {model.sampleCount}
                  </span>
                </div>
              ))
            ) : (
              <div className="state">
                <h3>INSUFFICIENT SAMPLE</h3>
                <p>No settled model observations are available.</p>
              </div>
            )}
          </section>
        </div>
      </AdminShell>
    );
  } catch {
    return (
      <AdminGate
        kicker="Intelligence operations"
        title="Intelligence schema not verified"
        body="The coverage read model is implemented, but its database migration must pass the isolated DB workflow before use."
      />
    );
  } finally {
    await runtime.close();
  }
}
