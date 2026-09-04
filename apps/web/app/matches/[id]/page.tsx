import { CustomerShell, Metric, Status } from "../../customer-shell";
import { findCustomerMatch } from "../../customer-data";
import { formatPercent } from "@velyq/ui";

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
    metric === null ? "—" : `${metric}${suffix}`;
  return (
    <CustomerShell>
      <div className="page-heading">
        <div>
          <p className="kicker">MATCH INTELLIGENCE · FOOTBALL</p>
          <h1>
            {match.homeTeam} <span className="versus">vs</span> {match.awayTeam}
          </h1>
          <p>
            {match.competition} · {match.startsAt} · {match.syntheticLabel}
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
            <h2>Prediction context</h2>
            <Status tone="heuristic">EXPERIMENTAL</Status>
          </div>
          <p className="reason">
            {context} This is an experimental deterministic model, not a
            validated betting model.
          </p>
          <div className="trace">
            <span>Model</span>
            <b>
              {match.trace.modelVersion} · {match.trace.maturity}
            </b>
            <span>Quality policy</span>
            <b>
              {match.quality.policyVersion} · {match.quality.grade}
            </b>
            <span>As-of</span>
            <b>{match.trace.featureCutoff}</b>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h2>Lineup & Radar</h2>
            <Status tone={match.lineup === "OFFICIAL" ? "positive" : "amber"}>
              {match.lineup}
            </Status>
          </div>
          <p>
            Opening <b>{value(match.openingOdds)}</b> → current{" "}
            <b>{value(match.currentOdds)}</b>
          </p>
          <p className="teal-text">
            {match.quality.reasonCodes.length
              ? match.quality.reasonCodes.join(" · ")
              : "Market movement detected · observable evidence"}
          </p>
          <Status tone="heuristic">DEVELOPMENT HEURISTIC</Status>
        </div>
      </section>
    </CustomerShell>
  );
}
