import { CustomerShell, Metric, Status } from "../customer-shell";
import { loadCustomerToday } from "../customer-runtime";
import { formatPercent, message } from "@velyq/ui";

const toneFor = (recommendation: string) =>
  recommendation === "STRONG_EDGE"
    ? "positive"
    : recommendation === "WAIT" || recommendation === "WAIT_FOR_LINEUP"
      ? "amber"
      : "neutral";

export default async function Edge() {
  const customerToday = await loadCustomerToday();
  if (!customerToday)
    return (
      <CustomerShell>Customer data is temporarily unavailable.</CustomerShell>
    );
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
          <div className="edge-row" key={match.eventId}>
            <strong>
              {match.homeTeam} · {match.selection}
            </strong>
            <Metric label="Odds" value={match.currentOdds ?? "—"} />
            <Metric
              label="Model probability"
              value={formatPercent(match.modelProbability)}
            />
            <Metric label="Fair odds" value={match.fairOdds ?? "—"} />
            <Metric label="EV" value={formatPercent(match.expectedValue)} />
            <Status tone={toneFor(match.recommendation)}>
              {match.recommendation.replaceAll("_", " ")}
            </Status>
          </div>
        ))}
      </section>
    </CustomerShell>
  );
}
