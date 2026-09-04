import Link from "next/link";
import { AdminShell } from "../admin-page";
export default function ScoresPage() {
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
