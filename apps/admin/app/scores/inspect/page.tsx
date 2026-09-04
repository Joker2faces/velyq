import Link from "next/link";
import { AdminShell, getAdminContext } from "../../admin-page";
export default async function ScoreInspectPage() {
  const { runtime } = await getAdminContext("scores.inspect");
  if (!runtime)
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Score access required.</h1>
          <p>Admin permission is required.</p>
        </div>
      </main>
    );
  await runtime.close();
  return (
    <AdminShell>
      <section className="page-heading">
        <p className="eyebrow">INSPECTION / SCORE</p>
        <h1>Score inspection</h1>
        <p>
          Open a score using its immutable identifier from the customer trace or
          operational record.
        </p>
      </section>
      <section className="panel callout">
        <h2>EDGE and RADAR are development heuristics</h2>
        <p>
          The console exposes observable evidence and formula metadata only;
          Phase 1 does not claim statistical validation or money flow.
        </p>
        <code>/api/v1/admin/scores/&lt;score-id&gt;</code>
      </section>
      <Link href="/scores">← EDGE / RADAR</Link>
    </AdminShell>
  );
}
