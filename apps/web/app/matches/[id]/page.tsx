import { CustomerShell, Metric, Status } from "../../customer-shell";
import { findCustomerMatch } from "../../customer-data";
import { formatDateTime, formatDecimal, formatPercent } from "@velyq/ui";

export default async function Match({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const match = findCustomerMatch(id);
  if (!match)
    return <CustomerShell>Match intelligence is not available.</CustomerShell>;
  const recommendation = match.recommendation.replaceAll("_", " ");
  const context =
    match.recommendation === "STRONG_EDGE"
      ? "Model probability is above the current implied probability."
      : match.recommendation === "EDGE_DISAPPEARED"
        ? "The earlier price advantage is no longer observable at the current quote."
        : match.recommendation === "WAIT_FOR_LINEUP"
          ? "The recommendation is withheld until an official lineup is available."
          : match.recommendation === "INSUFFICIENT_DATA"
            ? "The recommendation is withheld because required price or coverage inputs are missing."
            : "The current evidence does not meet the recommendation policy threshold.";
  const value = (metric: string | null, suffix = "") =>
    metric === null ? "—" : `${formatDecimal(metric)}${suffix}`;
  return (
    <CustomerShell>
      <div className="page-heading">
        <div>
          <p className="kicker">MATCH INTELLIGENCE · FOOTBALL</p>
          <h1>
            {match.homeTeam} <span className="versus">vs</span> {match.awayTeam}
          </h1>
          <p>
            {match.competition} · {formatDateTime(match.startsAt)} ·{" "}
            {match.syntheticLabel}
          </p>
        </div>
        <Status tone="synthetic">{match.syntheticLabel.toUpperCase()}</Status>
      </div>
      <section className="match-hero panel">
        <div>
          <span className="kicker">RECOMMENDATION</span>
          <h2>{recommendation}</h2>
          <p>
            Quality {match.quality.grade} · lineup {match.lineup.toLowerCase()}{" "}
            · evidence {match.freshness.toLowerCase()}
          </p>
        </div>
        <div className="hero-score">
          {formatPercent(match.probabilityEdge)} edge
          <small>VELYQ EDGE</small>
        </div>
      </section>
      <section className="metric-grid">
        <Metric label="Selection" value={match.selection} />
        <Metric label="Current odds" value={value(match.currentOdds)} />
        <Metric
          label="Model probability"
          value={formatPercent(match.modelProbability)}
        />
        <Metric
          label="Implied probability"
          value={formatPercent(match.impliedProbability)}
        />
        <Metric label="Fair odds" value={value(match.fairOdds)} />
        <Metric
          label="Expected value"
          value={formatPercent(match.expectedValue)}
          tone="teal"
        />
      </section>
      <section className="content-grid">
        <div className="panel">
          <div className="panel-head">
            <h2>EDGE breakdown</h2>
            <Status tone="heuristic">DEVELOPMENT HEURISTIC</Status>
          </div>
          <div className="trace">
            <span>Probability edge</span>
            <b>{formatPercent(match.probabilityEdge)}</b>
            <span>Expected value</span>
            <b>{formatPercent(match.expectedValue)}</b>
            <span>Quality gate</span>
            <b>
              {match.quality.grade} · {match.quality.policyVersion}
            </b>
            <span>Score definition</span>
            <b>{match.trace.scoreVersion}</b>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h2>RADAR evidence</h2>
            <Status tone="heuristic">OBSERVABLE ONLY</Status>
          </div>
          <p>
            Opening <b>{value(match.openingOdds)}</b> → current{" "}
            <b>{value(match.currentOdds)}</b>
          </p>
          <p className="teal-text">
            Movement{" "}
            {match.movementPercent
              ? `${formatPercent(match.movementPercent)}`
              : "not available"}{" "}
            · freshness {match.freshness.toLowerCase()}
          </p>
          <small>No money-flow or volume claims are exposed.</small>
        </div>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>VELYQ INSIGHT factors</h2>
          <Status tone="heuristic">EXPERIMENTAL</Status>
        </div>
        <div className="factor-grid">
          <div>
            <span>Price evidence</span>
            <b>{match.currentOdds ? "Available" : "Missing"}</b>
          </div>
          <div>
            <span>Lineup certainty</span>
            <b>{match.lineup}</b>
          </div>
          <div>
            <span>Data freshness</span>
            <b>{match.freshness}</b>
          </div>
          <div>
            <span>Mapping quality</span>
            <b>{match.quality.grade}</b>
          </div>
        </div>
      </section>
      <section className="content-grid">
        <div className="panel">
          <div className="panel-head">
            <h2>Data quality</h2>
            <Status tone={match.quality.grade === "F" ? "amber" : "positive"}>
              GRADE {match.quality.grade}
            </Status>
          </div>
          <p className="reason">
            {context} This is an experimental deterministic model, not a
            validated betting model.
          </p>
          <p className="teal-text">
            {match.quality.reasonCodes.length
              ? match.quality.reasonCodes.join(" · ")
              : "All required quality checks passed."}
          </p>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h2>Lineup state</h2>
            <Status tone={match.lineup === "OFFICIAL" ? "positive" : "amber"}>
              {match.lineup}
            </Status>
          </div>
          <p>
            {match.lineup === "OFFICIAL"
              ? "Official lineup observed."
              : match.lineup === "MISSING"
                ? "No lineup is available; recommendation remains gated."
                : `Lineup state is ${match.lineup.toLowerCase()}.`}
          </p>
          <small>Lineup state is evidence, not a prediction.</small>
        </div>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>Trace metadata</h2>
          <Status tone="heuristic">TRACEABLE</Status>
        </div>
        <div className="trace">
          <span>Model</span>
          <b>
            {match.trace.modelVersion} · {match.trace.maturity}
          </b>
          <span>Calibration</span>
          <b>{match.trace.calibrationVersion}</b>
          <span>Score</span>
          <b>{match.trace.scoreVersion}</b>
          <span>Quality policy</span>
          <b>
            {match.quality.policyVersion} · {match.quality.grade}
          </b>
          <span>Price snapshot</span>
          <b>
            {value(match.currentOdds)} · {match.freshness}
          </b>
          <span>Feature cutoff</span>
          <b>{formatDateTime(match.trace.featureCutoff)}</b>
        </div>
      </section>
    </CustomerShell>
  );
}
