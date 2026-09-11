import Link from "next/link";
import type { Translator } from "@velyq/ui";
import type { AdminProviderIngestionRunDto } from "./admin-api";
import {
  quotaStateLabel,
  resultOutcomeLabel,
  runHealthLabel,
  runHealthTone,
  runStatusLabel,
  runTriggerLabel,
} from "./provider-ingestion-copy";

function reasonList(reasons: Readonly<Record<string, number>>, t: Translator) {
  const entries = Object.entries(reasons).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return entries.length ? (
    <ul>
      {entries.map(([reason, count]) => (
        <li key={reason}>
          <code>{reason}</code> × {count}
        </li>
      ))}
    </ul>
  ) : (
    <span>{t("adminNone")}</span>
  );
}

export function ProviderIngestionHealthStatus({
  runHealth,
  t,
}: {
  runHealth: AdminProviderIngestionRunDto["runHealth"];
  t: Translator;
}) {
  const health = runHealthLabel(t, runHealth);
  return (
    <span
      aria-label={t("adminHealthAria", { health })}
      className={`ops-status ops-status--${runHealthTone(runHealth)}`}
    >
      {health}
    </span>
  );
}

export function ProviderIngestionPagination({
  cursor,
  nextCursor,
  t,
}: {
  cursor: string | null;
  nextCursor: string | null;
  t: Translator;
}) {
  if (!cursor && !nextCursor) return null;
  return (
    <nav aria-label={t("adminPaginationLabel")}>
      {cursor ? (
        <Link href="/provider-ingestion-runs">← {t("adminNewestRuns")}</Link>
      ) : null}{" "}
      {nextCursor ? (
        <Link
          href={`/provider-ingestion-runs?cursor=${encodeURIComponent(nextCursor)}`}
        >
          {t("adminOlderRuns")} →
        </Link>
      ) : null}
    </nav>
  );
}

export function ProviderIngestionRunView({
  run,
  t,
}: {
  run: AdminProviderIngestionRunDto;
  t: Translator;
}) {
  const phases = [
    {
      name: t("adminOddsLabel"),
      candidates: run.odds.candidates,
      attempts: run.odds.requestsAttempted,
      received: run.odds.received,
      written: run.odds.written,
      extra: t("adminDuplicatesCount", { count: run.odds.duplicates }),
    },
    {
      name: t("adminLineupsLabel"),
      candidates: run.lineups.candidates,
      attempts: run.lineups.requestsAttempted,
      received: run.lineups.received,
      written: run.lineups.written,
      extra: t("adminOfficialDuplicates", {
        official: run.lineups.official,
        duplicates: run.lineups.duplicates,
      }),
    },
    {
      name: t("adminResultsLabel"),
      candidates: run.results.candidates,
      attempts: run.results.requestsAttempted,
      received: run.results.received,
      written: run.results.written,
      extra: t("adminSettlementsDuplicates", {
        settlements: run.results.settlementsWritten,
        duplicates: run.results.duplicates,
      }),
    },
  ];

  return (
    <>
      <section className="detail-grid" aria-label={t("adminRunSummaryAria")}>
        <article>
          <span>{t("adminHealthLabel")}</span>
          <ProviderIngestionHealthStatus runHealth={run.runHealth} t={t} />
        </article>
        {[
          [t("adminStatusLabel"), runStatusLabel(t, run.status)],
          [
            t("adminResultOutcomeLabel"),
            resultOutcomeLabel(t, run.resultOutcome),
          ],
          [t("adminTriggerLabel"), runTriggerLabel(t, run.trigger)],
          [t("adminProviderCallsLabel"), String(run.providerCallsUsed)],
          [t("adminStartedLabel"), run.startedAt],
          [t("adminFinishedLabel"), run.finishedAt ?? "—"],
          [t("adminQuotaDayLabel"), run.quotaDay],
          [
            t("adminQuotaStartLabel"),
            quotaStateLabel(t, run.quotaStateAtStart),
          ],
          [t("adminQuotaEndLabel"), quotaStateLabel(t, run.quotaStateAtEnd)],
          [
            t("adminQuotaRemainingLabel"),
            run.quotaRemainingAtEnd === null
              ? "—"
              : String(run.quotaRemainingAtEnd),
          ],
          [t("adminQuotaPolicyLabel"), run.quotaPolicyVersion],
        ].map(([name, value]) => (
          <article key={name}>
            <span>{name}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      {run.runHealth === "HEALTHY_IDLE" ? (
        <section className="panel">
          <h2>{t("adminNoWorkDueTitle")}</h2>
          <p>{t("adminNoWorkDueBody")}</p>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-heading">
          <h2>{t("adminAttemptsWritesTitle")}</h2>
        </div>
        <div className="ops-metrics">
          <div className="ops-metric">
            <span className="ops-metric__label">{t("adminFixturesLabel")}</span>
            <span className="ops-metric__value">
              {t("adminWrittenCount", { count: run.fixtures.written })}
            </span>
            <span className="ops-metric__note">
              {t("adminReceivedDates", {
                received: run.fixtures.received,
                dates: run.discoveryDatesRequested.length
                  ? run.discoveryDatesRequested.join(", ")
                  : t("adminDatesNone"),
              })}
            </span>
          </div>
          {phases.map((phase) => (
            <div className="ops-metric" key={phase.name}>
              <span className="ops-metric__label">{phase.name}</span>
              <span className="ops-metric__value">
                {t("adminAttemptsWritten", {
                  attempts: phase.attempts,
                  written: phase.written,
                })}
              </span>
              <span className="ops-metric__note">
                {t("adminCandidatesReceivedExtra", {
                  candidates: phase.candidates,
                  received: phase.received,
                  extra: phase.extra,
                })}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="detail-grid" aria-label={t("adminSkipsErrorsAria")}>
        <article>
          <span>{t("adminSkipsByReason")}</span>
          {reasonList(run.skippedByReason, t)}
        </article>
        <article>
          <span>{t("adminErrorsByReason")}</span>
          {reasonList(run.errorsByReason, t)}
        </article>
      </section>
    </>
  );
}
