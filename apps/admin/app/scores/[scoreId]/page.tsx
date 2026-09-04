import Link from "next/link";
import { AdminShell, getAdminContext } from "../../admin-page";
export const dynamic = "force-dynamic";
export default async function ScorePage({
  params,
}: {
  params: Promise<{ scoreId: string }>;
}) {
  const { scoreId } = await params;
  const { runtime } = await getAdminContext("scores.inspect");
  if (!runtime)
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Score access unavailable.</h1>
          <p>Admin permission is required.</p>
        </div>
      </main>
    );
  try {
    const score = await runtime.queries.getScore(scoreId).catch(() => null);
    if (!score)
      return (
        <main className="auth-page">
          <div className="auth-card">
            <h1>Score not found.</h1>
            <Link href="/scores">Back to scores</Link>
          </div>
        </main>
      );
    return (
      <AdminShell>
        <section className="page-heading">
          <p className="eyebrow">INSPECTION / {score.scoreType}</p>
          <h1>{score.score}</h1>
          <p>{score.validationStatus} · immutable score result</p>
        </section>
        <section className="detail-grid">
          {[
            ["Score ID", score.id],
            ["Definition", score.scoreDefinitionVersionId],
            ["Event outcome", score.eventMarketOutcomeId],
            ["Quality", score.dataQualityAssessmentId],
            ["As of", score.asOf],
            ["Components", JSON.stringify(score.components)],
            ["Weights", JSON.stringify(score.weights)],
            ["Caps / penalties", JSON.stringify(score.capsPenalties)],
            ["Reasons", score.reasonCodes.join(", ")],
          ].map(([label, value]) => (
            <article key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </section>
        <Link href="/scores">← EDGE / RADAR</Link>
      </AdminShell>
    );
  } finally {
    await runtime.close();
  }
}
