import { CustomerShell, Metric, Status } from "../customer-shell";
export default function Edge() {
  return (
    <CustomerShell>
      <div className="page-heading">
        <div>
          <p className="kicker">EDGE ENGINE</p>
          <h1>Value, with context.</h1>
          <p>Probability ≠ Value ≠ EDGE score.</p>
        </div>
        <Status tone="heuristic">DEVELOPMENT HEURISTIC</Status>
      </div>
      <section className="panel">
        <div className="panel-head">
          <h2>Current opportunities</h2>
          <span className="muted">07 tracked · synthetic</span>
        </div>
        <div className="edge-row">
          <strong>Northbridge United · Home</strong>
          <Metric label="Odds" value="1.85" />
          <Metric label="Model probability" value="60.0%" />
          <Metric label="Fair odds" value="1.67" />
          <Metric label="EV" value="+20.0%" />
          <Status tone="positive">STRONG EDGE</Status>
        </div>
        <div className="edge-row">
          <strong>Eastvale City · Draw</strong>
          <Metric label="Odds" value="3.40" />
          <Metric label="Model probability" value="—" />
          <Metric label="Quality" value="F" />
          <Status tone="neutral">NO BET</Status>
        </div>
      </section>
    </CustomerShell>
  );
}
