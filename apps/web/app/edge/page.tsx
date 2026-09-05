import { CustomerShell, Metric, Status } from "../customer-shell";
import { loadCustomerToday } from "../customer-runtime";
import {
  formatDecimal,
  formatPercent,
  formatPercentagePoints,
  message,
} from "@velyq/ui";
import Link from "next/link";
import { ScenarioStatus } from "../scenario-status";

const toneFor = (recommendation: string) =>
  recommendation === "STRONG_EDGE"
    ? "positive"
    : recommendation === "WAIT" || recommendation === "WAIT_FOR_LINEUP"
      ? "amber"
      : "neutral";

export default async function Edge() {
  const result = await loadCustomerToday("edge.full");
  if (!result.ok)
    return <CustomerShell>{message("customerUnavailable")}</CustomerShell>;
  const customerToday = result.value;
  return (
    <CustomerShell>
      <div className="page-heading">
        <div>
          <p className="kicker">EDGE ENGINE</p>
          <h1>Value, with context.</h1>
          <p>Probability ≠ Value ≠ EDGE score.</p>
        </div>
        <Status tone="heuristic">
          {message("developmentHeuristic").toUpperCase()}
        </Status>
      </div>
      <section className="panel">
        <div className="panel-head">
          <h2>Current opportunities</h2>
          <span className="muted">
            {customerToday.matches.length.toString().padStart(2, "0")} tracked ·{" "}
            {customerToday.syntheticLabel.toLowerCase()}
          </span>
        </div>
        {customerToday.matches.map((match) => (
          <Link
            className="edge-row"
            href={`/matches/${match.eventId}`}
            key={match.eventId}
          >
            <strong>
              {match.homeTeam} · {match.selection}
            </strong>
            <Metric label="Odds" value={formatDecimal(match.currentOdds)} />
            <Metric
              label="Model probability"
              value={formatPercent(match.modelProbability)}
            />
            <Metric label="Fair odds" value={formatDecimal(match.fairOdds)} />
            <Metric label="EV" value={formatPercent(match.expectedValue)} />
            <Metric
              label="Edge"
              value={formatPercentagePoints(match.probabilityEdge)}
            />
            <ScenarioStatus scenario={match.scenario} />
            <Status tone={toneFor(match.recommendation)}>
              {match.recommendation.replaceAll("_", " ")}
            </Status>
            <small>Open Match Intelligence →</small>
          </Link>
        ))}
      </section>
    </CustomerShell>
  );
}
