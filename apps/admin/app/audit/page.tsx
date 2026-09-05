import { AdminShell, getAdminContext } from "../admin-page";
export const dynamic = "force-dynamic";
export default async function AuditPage() {
  const { runtime } = await getAdminContext("audit.read");
  if (!runtime)
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Audit access required.</h1>
          <p>
            Only an authorized administrator can inspect immutable audit
            records.
          </p>
        </div>
      </main>
    );
  try {
    const audit = await runtime.queries.listAudit({ limit: 100, cursor: null });
    return (
      <AdminShell active="/audit">
        <section className="page-heading">
          <p className="eyebrow">TRACE / AUDIT</p>
          <h1>Audit log</h1>
          <p>Read-only administrative and system activity.</p>
        </section>
        <section className="panel">
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Audit events</caption>
              <thead>
                <tr>
                  <th>Occurred</th>
                  <th>Action</th>
                  <th>Resource</th>
                  <th>Actor</th>
                  <th>Request</th>
                </tr>
              </thead>
              <tbody>
                {audit.items.map((event) => (
                  <tr key={event.id}>
                    <td>{event.occurredAt}</td>
                    <td>
                      <strong>{event.action}</strong>
                    </td>
                    <td>
                      {event.resourceType}
                      <small>{event.resourceId ?? "—"}</small>
                    </td>
                    <td>
                      <small>{event.actorUserId}</small>
                    </td>
                    <td>
                      <small>{event.requestId}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </AdminShell>
    );
  } finally {
    await runtime.close();
  }
}
