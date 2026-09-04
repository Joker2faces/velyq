import Link from "next/link";
import { CustomerShell, Metric, Status } from "../customer-shell";
export default function Today() {
  return (
    <CustomerShell>
      <div className="page-heading">
        <div>
          <p className="kicker">THURSDAY · 04 SEP 2026</p>
          <h1>What needs your attention?</h1>
          <p>Market intelligence, distilled into the next useful decision.</p>
        </div>
        <Status tone="synthetic">SYNTHETIC DATA</Status>
      </div>
      <section className="metric-grid">
        <Metric label="Tracked opportunities" value="07" />
        <Metric label="Fresh market moves" value="03" tone="teal" />
        <Metric label="Quality warnings" value="02" tone="amber" />
      </section>
      <section className="content-grid">
        <div className="panel">
          <div className="panel-head">
            <h2>Top VELYQ EDGE opportunities</h2>
            <Status tone="heuristic">DEVELOPMENT HEURISTIC</Status>
          </div>
          <Link
            className="opportunity"
            href="/matches/73000000-0000-4000-8000-000000000001"
          >
            <div>
              <strong>
                Northbridge United <em>vs</em> Riverside Athletic
              </strong>
              <small>Full-time 1X2 · Home · 18:30</small>
            </div>
            <b className="edge-number">+10.0%</b>
            <Status tone="positive">STRONG EDGE</Status>
          </Link>
          <div className="opportunity">
            <div>
              <strong>
                Eastvale City <em>vs</em> Kingsport FC
              </strong>
              <small>Full-time 1X2 · Awaiting confirmed lineup</small>
            </div>
            <Status tone="amber">WAIT FOR LINEUP</Status>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h2>Market movements</h2>
            <Link href="/radar">View radar →</Link>
          </div>
          <div className="movement">
            <span>Northbridge · Home</span>
            <b>2.10 → 1.85</b>
            <small className="teal-text">movement detected</small>
          </div>
          <div className="movement">
            <span>Eastvale · Draw</span>
            <b>3.40 → 3.60</b>
            <small>fresh · 2 bookmakers</small>
          </div>
        </div>
      </section>
    </CustomerShell>
  );
}
