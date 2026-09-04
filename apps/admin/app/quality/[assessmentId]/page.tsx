import Link from "next/link";
import { AdminShell, getAdminContext } from "../../admin-page";
export const dynamic = "force-dynamic";
export default async function QualityPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;
  const { runtime } = await getAdminContext("quality.inspect");
  if (!runtime)
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Quality access unavailable.</h1>
          <p>Admin permission is required.</p>
        </div>
      </main>
    );
  try {
    const quality = await runtime.queries
      .getQuality(assessmentId)
      .catch(() => null);
    if (!quality)
      return (
        <main className="auth-page">
          <div className="auth-card">
            <h1>Assessment not found.</h1>
            <Link href="/">Back to dashboard</Link>
          </div>
        </main>
      );
    return (
      <AdminShell>
        <section className="page-heading">
          <p className="eyebrow">INSPECTION / QUALITY</p>
          <h1>Grade {quality.grade}</h1>
          <p>Versioned quality assessment · {quality.asOf}</p>
        </section>
        <section className="detail-grid">
          {[
            ["Assessment", quality.id],
            ["Policy", quality.policyVersionId],
            ["Event", quality.eventId],
            ["Market outcome", quality.marketOutcomeId ?? "—"],
            ["Numeric score", quality.numericScore],
            ["Components", JSON.stringify(quality.components)],
            ["Reasons", quality.reasonCodes.join(", ")],
            ["Created", quality.createdAt],
          ].map(([label, value]) => (
            <article key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </section>
        <Link href="/">← Dashboard</Link>
      </AdminShell>
    );
  } finally {
    await runtime.close();
  }
}
