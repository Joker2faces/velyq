import Link from "next/link";
import { translator } from "@velyq/ui";
import { AdminGate, AdminShell, getAdminContext } from "../../admin-page";
import { getLocale } from "../../locale";
import { runStatusLabel, runTriggerLabel } from "../../provider-ingestion-copy";
import { loadProviderIngestionRun } from "../../provider-ingestion-run-loader";
import { ProviderIngestionRunView } from "../../provider-ingestion-run-view";

export const dynamic = "force-dynamic";

export default async function ProviderIngestionRunDetail({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const t = translator(await getLocale());
  const { runtime } = await getAdminContext("provider_runs.read");
  if (!runtime)
    return (
      <AdminGate
        kicker={t("adminSignInKicker")}
        title={t("adminDeniedTitle")}
        body={t("adminDeniedBody")}
      />
    );

  try {
    const run = await loadProviderIngestionRun(runId, (id) =>
      runtime.queries.getProviderIngestionRun(id),
    );

    return (
      <AdminShell active="/provider-ingestion-runs">
        <section className="page-heading">
          <p className="eyebrow">{t("adminLiveDetailKicker")}</p>
          <h1>{run.providerCode}</h1>
          <p>
            {t("adminLiveDetailSubtitle", {
              trigger: runTriggerLabel(t, run.trigger),
              status: runStatusLabel(t, run.status),
              id: run.id,
            })}
          </p>
        </section>
        <ProviderIngestionRunView run={run} t={t} />
        <Link href="/provider-ingestion-runs">← {t("adminAllLiveRuns")}</Link>
      </AdminShell>
    );
  } finally {
    await runtime.close();
  }
}
