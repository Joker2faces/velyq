import { CustomerShell, Metric, Status } from "../../customer-shell";
export default function Match() {
  return (
    <CustomerShell>
      <div className="page-heading">
        <div>
          <p className="kicker">MATCH INTELLIGENCE · FOOTBALL</p>
          <h1>
            Northbridge United <span className="versus">vs</span> Riverside
            Athletic
          </h1>
          <p>Premier Synthetic League · 04 Sep 2026 · 18:30</p>
        </div>
        <Status tone="synthetic">SYNTHETIC DATA</Status>
      </div>
      <section className="match-hero panel">
        <div>
          <span className="kicker">RECOMMENDATION</span>
          <h2>Strong EDGE</h2>
          <p>Quality A · lineup official · evidence fresh</p>
        </div>
        <div className="hero-score">
          +10.0%<small>VELYQ EDGE</small>
        </div>
      </section>
      <section className="metric-grid">
        <Metric label="Selection" value="Home" />
        <Metric label="Current odds" value="1.85" />
        <Metric label="Model probability" value="60.0%" />
        <Metric label="Implied probability" value="54.1%" />
        <Metric label="Fair odds" value="1.67" />
        <Metric label="Expected value" value="+20.0%" tone="teal" />
      </section>
      <section className="content-grid">
        <div className="panel">
          <div className="panel-head">
            <h2>Prediction context</h2>
            <Status tone="heuristic">EXPERIMENTAL</Status>
          </div>
          <p className="reason">
            Model probability is above the current implied probability. This is
            an experimental deterministic model, not a validated betting model.
          </p>
          <div className="trace">
            <span>Model</span>
            <b>phase-1-experimental.v1</b>
            <span>Quality policy</span>
            <b>phase-1-quality.v1 · A</b>
            <span>As-of</span>
            <b>2026-09-04 10:00 UTC</b>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h2>Lineup & Radar</h2>
            <Status tone="positive">OFFICIAL</Status>
          </div>
          <p>
            Opening <b>2.10</b> → current <b>1.85</b>
          </p>
          <p className="teal-text">Market movement detected · 2/3 bookmakers</p>
          <Status tone="heuristic">DEVELOPMENT HEURISTIC</Status>
        </div>
      </section>
    </CustomerShell>
  );
}
