import type { AdminProviderIngestionRunDto } from "./admin-api";

function label(value: string) {
  const words = value.toLowerCase().replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function reasonList(reasons: Readonly<Record<string, number>>) {
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
    <span>None</span>
  );
}

export function ProviderIngestionRunView({
  run,
}: {
  run: AdminProviderIngestionRunDto;
}) {
  const phases = [
    {
      name: "Odds",
      candidates: run.odds.candidates,
      attempts: run.odds.requestsAttempted,
      received: run.odds.received,
      written: run.odds.written,
      extra: `Duplicates ${run.odds.duplicates}`,
    },
    {
      name: "Lineups",
      candidates: run.lineups.candidates,
      attempts: run.lineups.requestsAttempted,
      received: run.lineups.received,
      written: run.lineups.written,
      extra: `Official ${run.lineups.official} · duplicates ${run.lineups.duplicates}`,
    },
    {
      name: "Results",
      candidates: run.results.candidates,
      attempts: run.results.requestsAttempted,
      received: run.results.received,
      written: run.results.written,
      extra: `Settlements ${run.results.settlementsWritten} · duplicates ${run.results.duplicates}`,
    },
  ];

  return (
    <>
      <section className="detail-grid" aria-label="Run summary">
        {[
          ["Health", label(run.runHealth)],
          ["Status", label(run.status)],
          ["Result outcome", label(run.resultOutcome)],
          ["Trigger", label(run.trigger)],
          ["Provider calls", String(run.providerCallsUsed)],
          ["Started", run.startedAt],
          ["Finished", run.finishedAt ?? "—"],
          ["Quota day", run.quotaDay],
          ["Quota state at start", run.quotaStateAtStart ?? "—"],
          ["Quota state at end", run.quotaStateAtEnd ?? "—"],
          [
            "Quota remaining",
            run.quotaRemainingAtEnd === null
              ? "—"
              : String(run.quotaRemainingAtEnd),
          ],
          ["Quota policy", run.quotaPolicyVersion],
        ].map(([name, value]) => (
          <article key={name}>
            <span>{name}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      {run.runHealth === "HEALTHY_IDLE" ? (
        <section className="panel">
          <h2>No provider work was due</h2>
          <p>
            This completed scheduler wake-up is healthy. Zero provider calls
            means no discovery, odds, lineup, or result request was due.
          </p>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-heading">
          <h2>Attempts and writes</h2>
        </div>
        <div className="ops-metrics">
          <div className="ops-metric">
            <span className="ops-metric__label">Fixtures</span>
            <span className="ops-metric__value">
              {run.fixtures.written} written
            </span>
            <span className="ops-metric__note">
              {run.fixtures.received} received · dates{" "}
              {run.discoveryDatesRequested.length
                ? run.discoveryDatesRequested.join(", ")
                : "none"}
            </span>
          </div>
          {phases.map((phase) => (
            <div className="ops-metric" key={phase.name}>
              <span className="ops-metric__label">{phase.name}</span>
              <span className="ops-metric__value">
                {phase.attempts} Attempts · {phase.written} written
              </span>
              <span className="ops-metric__note">
                {phase.candidates} candidates · {phase.received} received ·{" "}
                {phase.extra}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="detail-grid" aria-label="Skips and errors">
        <article>
          <span>Skips by reason</span>
          {reasonList(run.skippedByReason)}
        </article>
        <article>
          <span>Errors by reason</span>
          {reasonList(run.errorsByReason)}
        </article>
      </section>
    </>
  );
}
