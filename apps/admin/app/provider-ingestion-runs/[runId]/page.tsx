import Link from "next/link";
import { AdminShell, getAdminContext } from "../../admin-page";
import { ProviderIngestionRunView } from "../../provider-ingestion-run-view";

export const dynamic = "force-dynamic";

export default async function ProviderIngestionRunDetail({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const { runtime } = await getAdminContext("provider_runs.read");
  if (!runtime)
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Access denied.</h1>
          <Link href="/">Return to admin</Link>
        </div>
      </main>
    );

  try {
    const run = await runtime.queries
      .getProviderIngestionRun(runId)
      .catch(() => null);
    if (!run)
      return (
        <main className="auth-page">
          <div className="auth-card">
            <h1>Live ingestion run not found.</h1>
            <Link href="/provider-ingestion-runs">Back to live runs</Link>
          </div>
        </main>
      );

    return (
      <AdminShell active="/provider-ingestion-runs">
        <section className="page-heading">
          <p className="eyebrow">OPERATIONS / LIVE PROVIDER RUN</p>
          <h1>{run.providerCode}</h1>
          <p>
            {run.trigger} · {run.status} · {run.id}
          </p>
        </section>
        <ProviderIngestionRunView run={run} />
        <Link href="/provider-ingestion-runs">← All live ingestion runs</Link>
      </AdminShell>
    );
  } finally {
    await runtime.close();
  }
}
