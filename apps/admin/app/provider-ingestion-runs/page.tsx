import Link from "next/link";
import { translator } from "@velyq/ui";
import { AdminGate, AdminShell, getAdminContext } from "../admin-page";
import { getLocale } from "../locale";
import {
  resultOutcomeLabel,
  runStatusLabel,
  runTriggerLabel,
} from "../provider-ingestion-copy";
import {
  ProviderIngestionHealthStatus,
  ProviderIngestionPagination,
} from "../provider-ingestion-run-view";

export const dynamic = "force-dynamic";

const reasonTotal = (reasons: Readonly<Record<string, number>>) =>
  Object.values(reasons).reduce((total, count) => total + count, 0);

export default async function ProviderIngestionRunsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string | string[] }>;
}) {
  const t = translator(await getLocale());
  const cursorValue = (await searchParams).cursor;
  const cursor = typeof cursorValue === "string" ? cursorValue : null;
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
    const runs = await runtime.queries.listProviderIngestionRuns({
      limit: 100,
      cursor,
    });
    return (
      <AdminShell active="/provider-ingestion-runs">
        <section className="page-heading">
          <p className="eyebrow">{t("adminLiveKicker")}</p>
          <h1>{t("adminLiveTitle")}</h1>
          <p>{t("adminLiveBody")}</p>
        </section>
        <section className="panel">
          {runs.items.length ? (
            <div className="table-wrap">
              <table>
                <caption className="sr-only">{t("adminLiveCaption")}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t("adminColumnProviderTrigger")}</th>
                    <th scope="col">{t("adminColumnHealthStatus")}</th>
                    <th scope="col">{t("adminColumnProviderCalls")}</th>
                    <th scope="col">{t("adminColumnAttemptsWrites")}</th>
                    <th scope="col">{t("adminColumnSkipsErrors")}</th>
                    <th scope="col">{t("adminColumnStartedFinished")}</th>
                    <th scope="col" className="sr-only">
                      {t("adminColumnTrace")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {runs.items.map((run) => (
                    <tr key={run.id}>
                      <td>
                        <strong>{run.providerCode}</strong>
                        <small>{runTriggerLabel(t, run.trigger)}</small>
                      </td>
                      <td>
                        <ProviderIngestionHealthStatus
                          runHealth={run.runHealth}
                          t={t}
                        />
                        <small>
                          {t("adminStatusAndResult", {
                            status: runStatusLabel(t, run.status),
                            result: resultOutcomeLabel(t, run.resultOutcome),
                          })}
                        </small>
                      </td>
                      <td>{run.providerCallsUsed}</td>
                      <td>
                        <small>
                          {t("adminPhaseAttemptsWrites", {
                            phase: t("adminOddsLabel"),
                            attempts: run.odds.requestsAttempted,
                            written: run.odds.written,
                          })}
                        </small>
                        <small>
                          {t("adminPhaseAttemptsWrites", {
                            phase: t("adminLineupsLabel"),
                            attempts: run.lineups.requestsAttempted,
                            written: run.lineups.written,
                          })}
                        </small>
                        <small>
                          {t("adminResultsAttemptsWrites", {
                            attempts: run.results.requestsAttempted,
                            written: run.results.written,
                            settlements: run.results.settlementsWritten,
                          })}
                        </small>
                      </td>
                      <td>
                        {t("adminSkipsErrorsCounts", {
                          skips: reasonTotal(run.skippedByReason),
                          errors: reasonTotal(run.errorsByReason),
                        })}
                      </td>
                      <td>
                        <small>{run.startedAt}</small>
                        <small>
                          {run.finishedAt ?? t("adminRunStatusRunning")}
                        </small>
                      </td>
                      <td>
                        <Link href={`/provider-ingestion-runs/${run.id}`}>
                          {t("adminDiagnose")} →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="state">
              <h3>{t("adminLiveEmptyTitle")}</h3>
              <p>{t("adminLiveEmptyBody")}</p>
            </div>
          )}
        </section>
        <ProviderIngestionPagination
          cursor={cursor}
          nextCursor={runs.nextCursor}
          t={t}
        />
        <p>
          {t("adminReplayPrompt")}{" "}
          <Link href="/provider-runs">{t("adminOpenReplay")} →</Link>
        </p>
      </AdminShell>
    );
  } finally {
    await runtime.close();
  }
}
