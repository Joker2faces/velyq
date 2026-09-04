import { stagingStatusShellCopy } from "./staging-status-shell-content";

const statuses = [
  { label: "WEB", value: "ONLINE", tone: "positive" },
  { label: "BUILD", value: "VERIFIED", tone: "positive" },
  { label: "DATABASE", value: "NOT YET CHECKED", tone: "pending" },
  { label: "AUTH", value: "NOT YET ACTIVE", tone: "pending" },
  { label: "DATA", value: "SYNTHETIC", tone: "synthetic" },
] as const;

const [brand, subtitle, environment, phase, dataMode] = stagingStatusShellCopy;

function getShortCommitSha(commitSha: string | undefined) {
  return commitSha && /^[0-9a-f]{7,40}$/i.test(commitSha)
    ? commitSha.slice(0, 8)
    : "UNKNOWN";
}

export default function StagingStatusShell() {
  const commitSha = getShortCommitSha(process.env["VERCEL_GIT_COMMIT_SHA"]);

  return (
    <main className="status-shell">
      <div className="status-shell__glow" aria-hidden="true" />
      <section className="status-shell__panel" aria-labelledby="status-title">
        <header className="status-shell__header">
          <div>
            <p className="status-shell__eyebrow">VELYQ // STAGING</p>
            <h1 id="status-title">{brand}</h1>
            <p className="status-shell__subtitle">{subtitle}</p>
          </div>
          <div className="status-shell__badges" aria-label="Environment status">
            <span className="status-shell__badge status-shell__badge--accent">
              {environment}
            </span>
            <span className="status-shell__badge">{phase}</span>
          </div>
        </header>

        <div className="status-shell__rule" />

        <div className="status-shell__intro">
          <p className="status-shell__label">SYSTEM STATUS</p>
          <p className="status-shell__headline">
            Foundation development in progress.
          </p>
          <p className="status-shell__muted">
            Phase 1 implementation in progress
          </p>
        </div>

        <div className="status-shell__status-grid" aria-label="System checks">
          {statuses.map((status) => (
            <div className="status-shell__status" key={status.label}>
              <span className="status-shell__status-label">{status.label}</span>
              <span
                className={`status-shell__pill status-shell__pill--${status.tone}`}
              >
                <span className="status-shell__dot" aria-hidden="true" />
                {status.value}
              </span>
            </div>
          ))}
        </div>

        <footer className="status-shell__footer">
          <div>
            <span className="status-shell__label">ENVIRONMENT</span>
            <strong>{environment}</strong>
          </div>
          <div>
            <span className="status-shell__label">COMMIT</span>
            <strong>{commitSha}</strong>
          </div>
          <div>
            <span className="status-shell__label">DATA MODE</span>
            <strong>{dataMode}</strong>
          </div>
        </footer>
      </section>
    </main>
  );
}
