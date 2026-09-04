import Link from "next/link";
import { AdminShell, getAdminContext } from "../admin-page";
export const dynamic = "force-dynamic";
export default async function ScoresPage() {
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
        <p className="eyebrow">INSPECTION / SCORES</p>
        <h1>EDGE / RADAR</h1>
        <p>
          Inspect development heuristics, observable components, weights, caps,
          penalties and evidence.
        </p>
      </section>
      <section className="link-grid">
        <Link href="/scores/inspect">
          <strong>Score inspection</strong>
          <span>Open an immutable score by ID</span>
        </Link>
        <Link href="/">
          <strong>Dashboard</strong>
          <span>Return to activity</span>
        </Link>
      </section>
    </AdminShell>
  );
}
