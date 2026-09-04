import Link from "next/link";
import { getAdminContext, AdminShell } from "../../admin-page";
export const dynamic = "force-dynamic";
export default async function PredictionPage({
  params,
}: {
  params: Promise<{ predictionId: string }>;
}) {
  const { predictionId } = await params;
  const { runtime, authentication } = await getAdminContext();
  if (!runtime || !authentication || "problem" in authentication)
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Trace access required.</h1>
          <p>Admin permission is required.</p>
        </div>
      </main>
    );
  try {
    const trace = await runtime.queries
      .getPredictionTrace(predictionId)
      .catch(() => null);
    if (!trace)
      return (
        <main className="auth-page">
          <div className="auth-card">
            <h1>Prediction not found.</h1>
            <Link href="/predictions">Back to traces</Link>
          </div>
        </main>
      );
    return (
      <AdminShell>
        <section className="page-heading">
          <p className="eyebrow">TRACE / PREDICTION</p>
          <h1>{trace.decisionStatus}</h1>
          <p>{trace.predictionId}</p>
        </section>
        <section className="detail-grid">
          {[
            ["Prediction", trace.predictionId],
            ["Run", trace.predictionRunId],
            ["Model", trace.modelVersionId],
            ["Calibration", trace.calibrationVersionId],
            ["Feature cutoff", trace.featureCutoff],
            ["Market outcome", trace.eventMarketOutcomeId],
            ["Quality", trace.dataQualityAssessmentId],
            ["Source inputs", trace.sourceObservationIds.join(", ") || "—"],
            ["Edge", trace.edge ?? "—"],
            ["Expected value", trace.expectedValue ?? "—"],
          ].map(([label, value]) => (
            <article key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </section>
        <Link href="/predictions">← Prediction traces</Link>
      </AdminShell>
    );
  } finally {
    await runtime.close();
  }
}
