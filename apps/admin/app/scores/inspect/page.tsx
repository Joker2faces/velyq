import Link from "next/link";
import { AdminShell } from "../../admin-page";
export default function ScoreInspectPage() {
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
