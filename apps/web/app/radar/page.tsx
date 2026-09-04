import { CustomerShell, Metric, Status } from "../customer-shell";
export default function Radar() {
  return (
    <CustomerShell>
      <div className="page-heading">
        <div>
          <p className="kicker">RADAR / MARKET EVIDENCE</p>
          <h1>Movement, observed.</h1>
          <p>Observable odds evidence only. No money-flow claims.</p>
        </div>
        <Status tone="heuristic">DEVELOPMENT HEURISTIC</Status>
      </div>
      <section className="panel">
        <div className="panel-head">
          <h2>Market movement</h2>
          <span className="muted">Freshness-aware evidence</span>
        </div>
        <div className="radar-row">
          <div>
            <strong>Northbridge · Home</strong>
            <small>2 bookmakers moving · 3 observed</small>
          </div>
          <Metric label="Opening" value="2.10" />
          <Metric label="Current" value="1.85" />
          <Metric label="Movement" value="−11.9%" tone="teal" />
          <Metric label="Freshness" value="Fresh" />
          <Status tone="positive">RADAR MOVE</Status>
        </div>
      </section>
    </CustomerShell>
  );
}
