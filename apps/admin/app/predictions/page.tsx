import Link from "next/link";
import { AdminShell } from "../admin-page";
export default function PredictionsPage() {
  return (
    <AdminShell>
      <section className="page-heading">
        <p className="eyebrow">TRACE / PREDICTIONS</p>
        <h1>Prediction traces</h1>
        <p>
          Every trace resolves to its model, cutoff, quality assessment and
          source observations.
        </p>
      </section>
      <section className="panel callout">
        <h2>Trace by immutable identifier</h2>
        <p>
          Use the prediction ID supplied by the customer result or operational
          workflow.
        </p>
        <code>/predictions/&lt;prediction-id&gt;</code>
      </section>
      <Link href="/">← Dashboard</Link>
    </AdminShell>
  );
}
