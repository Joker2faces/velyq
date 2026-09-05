import Link from "next/link";
import { formatCount, translator } from "@velyq/ui";
import { AdminGate, AdminShell, getAdminContext } from "./admin-page";
import { getLocale } from "./locale";

export const dynamic = "force-dynamic";

export default async function Page() {
  const locale = await getLocale();
  const t = translator(locale);
  const { runtime, authentication } = await getAdminContext("admin.access");

  if (!runtime) {
    if (authentication && "principal" in authentication) {
      return (
        <AdminGate
          kicker={t("adminSignInKicker")}
          title={t("adminDeniedTitle")}
          body={t("adminDeniedBody")}
        />
      );
    }
    return authentication ? (
      <AdminGate
        kicker={t("adminSignInKicker")}
        title={t("adminSignInTitle")}
        body={t("adminSignInBody")}
      >
        <form
          className="ops-gate__form"
          action="/api/v1/auth/sign-in"
          method="post"
        >
          <div className="field">
            <label className="field__label" htmlFor="email">
              {t("authEmailLabel")}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="password">
              {t("authPasswordLabel")}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <button
            className="button button--primary button--block"
            type="submit"
          >
            {t("adminSignInSubmit")}
          </button>
        </form>
        <p className="ops-gate__note">{t("adminSignInNote")}</p>
      </AdminGate>
    ) : (
      <AdminGate
        kicker={t("adminSignInKicker")}
        title={t("adminUnavailableTitle")}
        body={t("adminUnavailableBody")}
      />
    );
  }

  try {
    const runs = await runtime.queries.listProviderRuns({
      limit: 8,
      cursor: null,
    });

    return (
      <AdminShell active="/">
        <div className="ops-page">
          <div className="ops-page__head">
            <div className="ops-page__head-copy">
              <p className="eyebrow">{t("adminOverviewKicker")}</p>
              <h1>{t("adminOverviewTitle")}</h1>
              <p>{t("adminOverviewBody")}</p>
            </div>
            <div className="badges">
              <span>{t("adminSyntheticPhase")}</span>
              <span>{t("adminReadOnly")}</span>
            </div>
          </div>

          {/* Only figures the runtime actually returned. Nothing is
              fabricated to fill a card. */}
          <div className="ops-metrics">
            <div className="ops-metric">
              <span className="ops-metric__label">
                {t("adminNavProviderRuns")}
              </span>
              <span className="ops-metric__value">
                {formatCount(runs.items.length)}
              </span>
              <span className="ops-metric__note">{t("adminRunsVisible")}</span>
            </div>
            <div className="ops-metric">
              <span className="ops-metric__label">{t("adminDataPolicy")}</span>
              <span className="ops-metric__value">{t("adminGoverned")}</span>
              <span className="ops-metric__note">
                {t("adminDataPolicyValue")}
              </span>
            </div>
            <div className="ops-metric">
              <span className="ops-metric__label">{t("adminAccessLevel")}</span>
              <span className="ops-metric__value">
                {t("adminServerAuthorized")}
              </span>
              <span className="ops-metric__note">{t("adminAccessValue")}</span>
            </div>
          </div>

          <section className="panel">
            <div className="panel-heading">
              <h2>{t("adminRecentRuns")}</h2>
              <Link href="/audit">{t("adminOpenAudit")} →</Link>
            </div>

            {runs.items.length === 0 ? (
              <div className="state">
                <h3>{t("adminEmptyRuns")}</h3>
                <p>{t("adminEmptyBody")}</p>
              </div>
            ) : (
              <div className="ops-table-wrap">
                <table className="ops-table">
                  <caption className="sr-only">{t("adminRecentRuns")}</caption>
                  <thead>
                    <tr>
                      <th>{t("adminColumnSequence")}</th>
                      <th>{t("adminColumnStatus")}</th>
                      <th>{t("adminColumnAccepted")}</th>
                      <th>{t("adminColumnRejected")}</th>
                      <th>{t("adminColumnStarted")}</th>
                      <th>{t("adminColumnTrace")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.items.map((run) => (
                      <tr key={run.id}>
                        <td data-label={t("adminColumnSequence")}>
                          <strong>{run.sequenceName}</strong>
                          <small>{run.providerCode}</small>
                        </td>
                        <td data-label={t("adminColumnStatus")}>
                          <span
                            className={`ops-status ops-status--${run.status.toLowerCase()}`}
                          >
                            {run.status}
                          </span>
                        </td>
                        <td
                          className="ops-num"
                          data-label={t("adminColumnAccepted")}
                        >
                          {run.acceptedCount}
                        </td>
                        <td
                          className="ops-num"
                          data-label={t("adminColumnRejected")}
                        >
                          {run.rejectedCount}
                        </td>
                        <td
                          className="ops-num"
                          data-label={t("adminColumnStarted")}
                        >
                          {run.startedAt}
                        </td>
                        <td data-label={t("adminColumnTrace")}>
                          <Link href={`/provider-runs/${run.id}`}>
                            {t("adminInspect")} →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="ops-tiles" style={{ marginBottom: "var(--space-6)" }}>
            <Link className="ops-tile" href="/provider-runs">
              <strong>{t("adminNavProviderRuns")}</strong>
              <span>{t("adminDataPolicyValue")}</span>
            </Link>
            <Link className="ops-tile" href="/predictions">
              <strong>{t("adminNavPredictions")}</strong>
              <span>{t("matchTrace")}</span>
            </Link>
            <Link className="ops-tile" href="/scores">
              <strong>{t("adminNavScores")}</strong>
              <span>{t("observableOnly")}</span>
            </Link>
            <Link className="ops-tile" href="/audit">
              <strong>{t("adminNavAudit")}</strong>
              <span>{t("adminReadOnly")}</span>
            </Link>
          </div>
        </div>
      </AdminShell>
    );
  } finally {
    await runtime.close();
  }
}
