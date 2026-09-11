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
    const [data, quota, coverage] = await Promise.all([
      runtime.queries.getIntelligenceOverview(),
      runtime.queries.getQuotaSnapshot(),
      runtime.queries.getModelCoverageAudit(),
    ]);
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
              <h2>Provider quota</h2>
            </div>
            {quota.length === 0 ? (
              <div className="state">
                <h3>No quota state recorded yet</h3>
                <p>Nothing has called the provider today.</p>
              </div>
            ) : (
              <div className="ops-metrics">
                {quota.map((row) => (
                  <div
                    className="ops-metric"
                    key={`${row.providerCode}:${row.quotaDay}`}
                  >
                    <span className="ops-metric__label">
                      {row.providerCode} · {row.quotaDay}
                    </span>
                    <span className="ops-metric__value">
                      {row.policyState}
                      {row.remaining !== null && row.dailyLimit !== null
                        ? ` · ${row.remaining}/${row.dailyLimit} remaining`
                        : ""}
                    </span>
                    <span className="ops-metric__note">
                      {row.requestsUsed} calls used (discovery{" "}
                      {row.discoveryRequests}, odds {row.oddsRequests}, lineup{" "}
                      {row.lineupRequests}, result {row.resultRequests}) · last
                      call {row.lastProviderCallAt ?? "never"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
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
              <h2>Data coverage vs. model decision</h2>
            </div>
            <p>
              A real-time dry run of today’s fixtures against the same
              competition/team resolution the forecast cycle uses. This
              separates a genuine data coverage gap (competition or team not in
              the model) from a fixture the model actually evaluated and decided
              not to act on — that second case is a real business outcome,
              visible above under primary blockers, not a coverage problem.
            </p>
            <div className="ops-metrics">
              <div className="ops-metric">
                <span className="ops-metric__label">Fixtures checked</span>
                <span className="ops-metric__value">
                  {coverage.fixturesChecked}
                </span>
              </div>
              <div className="ops-metric">
                <span className="ops-metric__label">
                  Competition not in model
                </span>
                <span className="ops-metric__value">
                  {coverage.competitionMissing}
                </span>
              </div>
              <div className="ops-metric">
                <span className="ops-metric__label">Team not in model</span>
                <span className="ops-metric__value">
                  {coverage.teamMissing}
                </span>
              </div>
              <div className="ops-metric">
                <span className="ops-metric__label">Eligible for model</span>
                <span className="ops-metric__value">{coverage.eligible}</span>
              </div>
            </div>
            {coverage.missingCompetitions.length ? (
              <p>
                Missing competitions: {coverage.missingCompetitions.join(", ")}
              </p>
            ) : null}
            {coverage.missingTeams.length ? (
              <p>Missing teams: {coverage.missingTeams.join(", ")}</p>
            ) : null}
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
              Last successful live result request:{" "}
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
                      : `Brier ${model.brierScore?.toFixed(4)} · Log loss ${model.logLoss?.toFixed(4)} · ECE ${model.calibrationError?.toFixed(4)}`}
                  </span>
                  <span className="ops-metric__note">
                    Sample {model.sampleCount}
                    {model.baselineHitRate !== null
                      ? ` · baseline hit rate ${(model.baselineHitRate * 100).toFixed(1)}%`
                      : ""}
                  </span>
                  {/*
                   * A binary framing of the decision's own selected outcome
                   * (did it happen or not), not a full three-way 1X2
                   * calibration -- see the code comment in
                   * getIntelligenceOverview for why. Still real: each bin is
                   * a real bucket of real decisions.
                   */}
                  {model.calibrationBins.some((bin) => bin.count > 0) ? (
                    <table className="ops-table">
                      <thead>
                        <tr>
                          <th>Predicted</th>
                          <th>Observed</th>
                          <th>N</th>
                        </tr>
                      </thead>
                      <tbody>
                        {model.calibrationBins
                          .filter((bin) => bin.count > 0)
                          .map((bin) => (
                            <tr key={bin.lowerBound}>
                              <td>
                                {(bin.lowerBound * 100).toFixed(0)}–
                                {(bin.upperBound * 100).toFixed(0)}%
                              </td>
                              <td>
                                {(bin.observedFrequency * 100).toFixed(1)}%
                              </td>
                              <td>{bin.count}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  ) : null}
                  {model.byCompetition.length > 0 ? (
                    <table className="ops-table">
                      <thead>
                        <tr>
                          <th>Competition</th>
                          <th>Sample</th>
                          <th>Brier</th>
                          <th>Log loss</th>
                          <th>Baseline hit rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {model.byCompetition.map((competition) => (
                          <tr key={competition.competitionCode}>
                            <td>{competition.competitionCode}</td>
                            <td>{competition.sampleCount}</td>
                            <td>
                              {competition.brierScore === null
                                ? "INSUFFICIENT SAMPLE"
                                : competition.brierScore.toFixed(4)}
                            </td>
                            <td>
                              {competition.logLoss === null
                                ? "—"
                                : competition.logLoss.toFixed(4)}
                            </td>
                            <td>
                              {competition.baselineHitRate === null
                                ? "—"
                                : `${(competition.baselineHitRate * 100).toFixed(1)}%`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="state">
                <h3>INSUFFICIENT SAMPLE</h3>
                <p>No settled model observations are available.</p>
              </div>
            )}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>True 1X2 calibration (HOME/DRAW/AWAY)</h2>
            </div>
            <p>
              Every settled fixture the model priced, scored on the actual
              three-way outcome — not only the events a decision was acted on
              for. Kept EXPERIMENTAL below the sample-size floor regardless of
              how the numbers look; this audit does not promote model maturity.
            </p>
            {data.multiClassCalibration.length ? (
              data.multiClassCalibration.map((model) => (
                <div className="ops-metric" key={model.modelVersion}>
                  <span className="ops-metric__label">
                    {model.modelVersion}
                  </span>
                  <span className="ops-metric__value">
                    {model.status === "INSUFFICIENT_SAMPLE"
                      ? "EXPERIMENTAL · INSUFFICIENT SAMPLE"
                      : `Brier ${model.brierScore?.toFixed(4)} · Log loss ${model.logLoss?.toFixed(4)} · ECE ${model.calibrationError?.toFixed(4)}`}
                  </span>
                  <span className="ops-metric__note">
                    Sample {model.sampleCount}
                    {model.baselineFrequencies
                      ? ` · empirical baseline HOME ${(model.baselineFrequencies.home * 100).toFixed(1)}% / DRAW ${(model.baselineFrequencies.draw * 100).toFixed(1)}% / AWAY ${(model.baselineFrequencies.away * 100).toFixed(1)}%`
                      : ""}
                  </span>
                  {model.byCompetition.length > 0 ? (
                    <table className="ops-table">
                      <thead>
                        <tr>
                          <th>Competition</th>
                          <th>Sample</th>
                          <th>Brier</th>
                          <th>Log loss</th>
                        </tr>
                      </thead>
                      <tbody>
                        {model.byCompetition.map((competition) => (
                          <tr key={competition.competitionCode}>
                            <td>{competition.competitionCode}</td>
                            <td>{competition.sampleCount}</td>
                            <td>
                              {competition.brierScore === null
                                ? "INSUFFICIENT SAMPLE"
                                : competition.brierScore.toFixed(4)}
                            </td>
                            <td>
                              {competition.logLoss === null
                                ? "—"
                                : competition.logLoss.toFixed(4)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}
                  {model.bySeason.length > 0 ? (
                    <table className="ops-table">
                      <thead>
                        <tr>
                          <th>Season</th>
                          <th>Sample</th>
                          <th>Brier</th>
                          <th>Log loss</th>
                        </tr>
                      </thead>
                      <tbody>
                        {model.bySeason.map((season) => (
                          <tr key={season.seasonLabel}>
                            <td>{season.seasonLabel}</td>
                            <td>{season.sampleCount}</td>
                            <td>
                              {season.brierScore === null
                                ? "INSUFFICIENT SAMPLE"
                                : season.brierScore.toFixed(4)}
                            </td>
                            <td>
                              {season.logLoss === null
                                ? "—"
                                : season.logLoss.toFixed(4)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}
                  <table className="ops-table">
                    <thead>
                      <tr>
                        <th>Baseline</th>
                        <th>Sample</th>
                        <th>Brier</th>
                        <th>Log loss</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>VELYQ model</td>
                        <td>{model.sampleCount}</td>
                        <td>
                          {model.brierScore === null
                            ? "INSUFFICIENT SAMPLE"
                            : model.brierScore.toFixed(4)}
                        </td>
                        <td>
                          {model.logLoss === null
                            ? "—"
                            : model.logLoss.toFixed(4)}
                        </td>
                      </tr>
                      <tr>
                        <td>No-vig market consensus</td>
                        <td>{model.noVigConsensus.sampleCount}</td>
                        <td>
                          {model.noVigConsensus.brierScore === null
                            ? "INSUFFICIENT SAMPLE"
                            : model.noVigConsensus.brierScore.toFixed(4)}
                        </td>
                        <td>
                          {model.noVigConsensus.logLoss === null
                            ? "—"
                            : model.noVigConsensus.logLoss.toFixed(4)}
                        </td>
                      </tr>
                      <tr>
                        <td>Raw implied market (vig-included)</td>
                        <td>{model.impliedMarket.sampleCount}</td>
                        <td>
                          {model.impliedMarket.brierScore === null
                            ? "INSUFFICIENT SAMPLE"
                            : model.impliedMarket.brierScore.toFixed(4)}
                        </td>
                        <td>
                          {model.impliedMarket.logLoss === null
                            ? "—"
                            : model.impliedMarket.logLoss.toFixed(4)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <p>
                    Lower is better for both columns. VELYQ is not promoted
                    above EXPERIMENTAL on the strength of this comparison alone
                    -- it is one input among several, not an automatic
                    certification.
                  </p>
                </div>
              ))
            ) : (
              <div className="state">
                <h3>INSUFFICIENT SAMPLE</h3>
                <p>No settled 1X2 fixtures are available yet.</p>
              </div>
            )}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Identity issues</h2>
            </div>
            {data.identityIssues.length ? (
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Provider competition</th>
                    <th>Status</th>
                    <th>Provider id</th>
                  </tr>
                </thead>
                <tbody>
                  {data.identityIssues.map((issue) => (
                    <tr key={issue.providerCompetitionId}>
                      <td>{issue.displayName}</td>
                      <td>{issue.mappingStatus}</td>
                      <td>{issue.providerCompetitionId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="state">
                <h3>No unresolved identities</h3>
                <p>Every competition identity on record is CONFIRMED.</p>
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
