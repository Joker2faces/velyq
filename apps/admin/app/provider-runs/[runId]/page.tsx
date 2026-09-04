import Link from "next/link";
import { AdminShell, getAdminContext } from "../../admin-page";
export const dynamic = "force-dynamic";
export default async function ProviderRunDetail({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const { runtime, authentication } = await getAdminContext();
  if (!runtime || !authentication || "problem" in authentication)
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Access denied.</h1>
          <Link href="/">Return to admin</Link>
        </div>
      </main>
    );
  try {
    const run = await runtime.queries.getProviderRun(runId).catch(() => null);
    if (!run)
      return (
        <main className="auth-page">
          <div className="auth-card">
            <h1>Provider run not found.</h1>
            <Link href="/provider-runs">Back to runs</Link>
          </div>
        </main>
      );
    return (
      <AdminShell>
        <section className="page-heading">
          <p className="eyebrow">TRACE / PROVIDER RUN</p>
          <h1>{run.sequenceName}</h1>
          <p>
            {run.providerCode} · {run.status}
          </p>
        </section>
        <section className="detail-grid">
          {[
            ["Run ID", run.id],
            ["Started", run.startedAt],
            ["Completed", run.completedAt ?? "—"],
            ["Accepted", String(run.acceptedCount)],
            ["Rejected", String(run.rejectedCount)],
            ["Source fixture", run.sourceFixtureHash],
            ["Normalized output", run.normalizedOutputHash],
            [
              "Error summary",
              run.errorSummary ? JSON.stringify(run.errorSummary) : "None",
            ],
          ].map(([label, value]) => (
            <article key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </section>
        <Link href="/provider-runs">← All provider runs</Link>
      </AdminShell>
    );
  } finally {
    await runtime.close();
  }
}
