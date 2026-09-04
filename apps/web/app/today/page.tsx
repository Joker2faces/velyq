import Link from "next/link";
import { customerToday } from "../customer-data";
import { CustomerShell, Metric, Status } from "../customer-shell";
import { formatPercent } from "@velyq/ui";
export default function Today() {
  const [primary, lineupWatch, qualityWarning] = customerToday.matches;
  if (!primary || !lineupWatch || !qualityWarning) {
    return <CustomerShell>Data is not available.</CustomerShell>;
  }
  const freshMoves = customerToday.matches.filter(
    ({ openingOdds, currentOdds }) =>
      openingOdds !== null && currentOdds !== null,
  ).length;
  const qualityWarnings = customerToday.matches.filter(
    ({ quality }) => quality.grade === "F",
  ).length;
  return (
    <CustomerShell>
      <div className="page-heading">
        <div>
          <p className="kicker">THURSDAY · 04 SEP 2026</p>
          <h1>What needs your attention?</h1>
          <p>Market intelligence, distilled into the next useful decision.</p>
        </div>
        <Status tone="synthetic">
          {customerToday.syntheticLabel.toUpperCase()}
        </Status>
      </div>
      <section className="metric-grid">
        <Metric
          label="Tracked opportunities"
          value={String(customerToday.matches.length).padStart(2, "0")}
        />
        <Metric
          label="Fresh market moves"
          value={String(freshMoves).padStart(2, "0")}
          tone="teal"
        />
        <Metric
          label="Quality warnings"
          value={String(qualityWarnings).padStart(2, "0")}
          tone="amber"
        />
      </section>
      <section className="content-grid">
        <div className="panel">
          <div className="panel-head">
            <h2>Top VELYQ EDGE opportunities</h2>
            <Status tone="heuristic">DEVELOPMENT HEURISTIC</Status>
          </div>
          <Link className="opportunity" href={`/matches/${primary.eventId}`}>
            <div>
              <strong>
                {primary.homeTeam} <em>vs</em> {primary.awayTeam}
              </strong>
              <small>Full-time 1X2 · {primary.selection} · 18:30</small>
            </div>
            <b className="edge-number">
              {formatPercent(primary.probabilityEdge)}
            </b>
            <Status tone="positive">
              {primary.recommendation.replaceAll("_", " ")}
            </Status>
          </Link>
          <div className="opportunity">
            <div>
              <strong>
                {lineupWatch.homeTeam} <em>vs</em> {lineupWatch.awayTeam}
              </strong>
              <small>Full-time 1X2 · lineup state {lineupWatch.lineup}</small>
            </div>
            <Status tone="amber">
              {lineupWatch.recommendation.replaceAll("_", " ")}
            </Status>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h2>Market movements</h2>
            <Link href="/radar">View radar →</Link>
          </div>
          <div className="movement">
            <span>Northbridge · Home</span>
            <b>
              {primary.openingOdds ?? "—"} → {primary.currentOdds ?? "—"}
            </b>
            <small className="teal-text">
              {primary.movementPercent
                ? `${formatPercent(primary.movementPercent)} movement detected`
                : "no movement evidence"}
            </small>
          </div>
          <div className="movement">
            <span>Eastvale · Draw</span>
            <b>
              {lineupWatch.openingOdds ?? "—"} →{" "}
              {lineupWatch.currentOdds ?? "—"}
            </b>
            <small>
              {lineupWatch.freshness.toLowerCase()} · lineup{" "}
              {lineupWatch.lineup.toLowerCase()}
            </small>
          </div>
        </div>
      </section>
    </CustomerShell>
  );
}
