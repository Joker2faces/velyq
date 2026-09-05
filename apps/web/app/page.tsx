export default function Page() {
  return (
    <main className="public-page">
      <p className="kicker">VELYQ</p>
      <h1>AI Sports Market Intelligence.</h1>
      <p>
        See what deserves attention across EDGE, RADAR and Match Intelligence.
      </p>
      <p>
        <a href="/sign-up">Create a free account</a> ·{" "}
        <a href="/sign-in">Sign in</a> · <a href="/pricing">View pricing</a>
      </p>
      <section className="panel">
        <h2>EDGE</h2>
        <p>
          Probability, fair odds and value explained with an experimental model.
        </p>
        <h2>RADAR</h2>
        <p>
          Observable odds movement and freshness, without invented money-flow
          claims.
        </p>
        <h2>Match Intelligence</h2>
        <p>
          One traceable view of fixture context, quality and recommendation
          state.
        </p>
      </section>
      <p className="fine-print">
        Phase 1 uses synthetic data. The prediction model is EXPERIMENTAL. EDGE
        and RADAR are DEVELOPMENT_HEURISTIC indicators.
      </p>
    </main>
  );
}
