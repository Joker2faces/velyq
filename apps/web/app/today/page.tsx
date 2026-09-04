import Link from "next/link";
import { loadCustomerToday } from "../customer-runtime";
import { CustomerShell, Metric, Status } from "../customer-shell";
import { formatDateTime, formatPercent, message } from "@velyq/ui";
export default async function Today() {
  const result = await loadCustomerToday();
  if (!result.ok)
    return <CustomerShell>{message("customerUnavailable")}</CustomerShell>;
  const customerToday = result.value;
  const [primary, lineupWatch] = customerToday.matches;
  if (!primary) {
    return <CustomerShell>{message("dataUnavailable")}</CustomerShell>;
  }
  const freshMoves = customerToday.matches.filter(
    ({ freshness, openingOdds, currentOdds }) =>
      freshness === "FRESH" && openingOdds !== null && currentOdds !== null,
  ).length;
  const qualityWarnings = customerToday.matches.filter(
    ({ quality }) => quality.grade === "F",
  ).length;
  return (
    <CustomerShell>
      <div className="page-heading">
        <div>
          <p className="kicker">
            {new Intl.DateTimeFormat("en-GB", {
              weekday: "long",
              day: "2-digit",
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            })
              .format(new Date(customerToday.asOf))
              .toUpperCase()}
          </p>
          <h1>What needs your attention?</h1>
          <p>
            Market intelligence, distilled into the next useful decision.{" "}
            Snapshot as of {formatDateTime(customerToday.asOf)} UTC.
          </p>
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
              <small>
                Full-time 1X2 · {primary.selection} · {time(primary.startsAt)}
              </small>
            </div>
            <b className="edge-number">
              {formatPercent(primary.probabilityEdge)}
            </b>
            <Status tone="positive">
              {primary.recommendation.replaceAll("_", " ")}
            </Status>
          </Link>
          {lineupWatch ? (
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
          ) : null}
        </div>
        <div className="panel">
          <div className="panel-head">
            <h2>Market movements</h2>
            <Link href="/radar">View radar →</Link>
          </div>
          <div className="movement">
            <span>
              {primary.homeTeam} · {primary.selection}
            </span>
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
            <span>
              {lineupWatch?.homeTeam ?? "—"} · {lineupWatch?.selection ?? "—"}
            </span>
            <b>
              {lineupWatch?.openingOdds ?? "—"} →{" "}
              {lineupWatch?.currentOdds ?? "—"}
            </b>
            <small>
              {lineupWatch?.freshness.toLowerCase() ?? "no data"} · lineup{" "}
              {lineupWatch?.lineup.toLowerCase() ?? "—"}
            </small>
          </div>
        </div>
      </section>
    </CustomerShell>
  );
}

function time(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}
