import { CustomerShell, Metric, Status } from "../customer-shell";
import { loadCustomerToday } from "../customer-runtime";
import { formatPercent, message } from "@velyq/ui";

export default async function Radar() {
  const result = await loadCustomerToday();
  if (!result.ok)
    return <CustomerShell>{message("customerUnavailable")}</CustomerShell>;
  const customerToday = result.value;
  return (
    <CustomerShell>
      <div className="page-heading">
        <div>
          <p className="kicker">RADAR / MARKET EVIDENCE</p>
          <h1>Movement, observed.</h1>
          <p>Observable odds evidence only. No money-flow claims.</p>
        </div>
        <Status tone="heuristic">
          {message("developmentHeuristic").toUpperCase()}
        </Status>
      </div>
      <section className="panel">
        <div className="panel-head">
          <h2>Market movement</h2>
          <span className="muted">Freshness-aware evidence</span>
        </div>
        {customerToday.matches.map((match) => (
          <div className="radar-row" key={match.eventId}>
            <div>
              <strong>
                {match.homeTeam} · {match.selection}
              </strong>
              <small>
                {match.openingOdds && match.currentOdds
                  ? "Observable price history"
                  : "No price history available"}
              </small>
            </div>
            <Metric label="Opening" value={match.openingOdds ?? "—"} />
            <Metric label="Current" value={match.currentOdds ?? "—"} />
            <Metric
              label="Movement"
              value={formatPercent(match.movementPercent)}
              tone="teal"
            />
            <Metric label="Freshness" value={match.freshness} />
            <Status
              tone={
                match.freshness === "FRESH" && match.currentOdds
                  ? "positive"
                  : "neutral"
              }
            >
              {match.currentOdds
                ? message("radarMove").toUpperCase()
                : message("noEvidence").toUpperCase()}
            </Status>
          </div>
        ))}
      </section>
    </CustomerShell>
  );
}
