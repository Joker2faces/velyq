export default function Page() {
  return (
    <main className="landing">
      <header className="landing-nav">
        <a className="brand" href="/">
          VELYQ <small>INTELLIGENCE PLATFORM</small>
        </a>
        <nav>
          <a href="#platform">Platform</a>
          <a href="/pricing">Pricing</a>
          <a href="/responsible-use">Responsible use</a>
        </nav>
        <div className="landing-actions">
          <a href="/sign-in">Sign in</a>
          <a className="button button-primary" href="/sign-up">
            Create account
          </a>
        </div>
      </header>
      <section className="landing-hero">
        <div className="hero-copy">
          <div className="eyebrow">SYNTHETIC BETA · EXPERIMENTAL MODEL</div>
          <h1>
            See the signal
            <br />
            <span>before the noise.</span>
          </h1>
          <p>
            VELYQ turns market observations into clear, traceable intelligence
            for sharper sports analysis.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="/sign-up">
              Create a free account
            </a>
            <a className="button button-ghost" href="/pricing">
              Explore plans <span>↗</span>
            </a>
          </div>
          <div className="trust-row">
            <span>◈ Observable evidence</span>
            <span>◉ No guaranteed claims</span>
            <span>◎ Greek + English</span>
          </div>
        </div>
        <div className="product-preview">
          <div className="preview-top">
            <b>VELYQ</b>
            <span>EDGE / RADAR / Match Intelligence</span>
            <i>LIVE</i>
          </div>
          <div className="preview-grid">
            <div className="preview-card edge-card">
              <small>EDGE SCORE</small>
              <strong>
                78<em>/100</em>
              </strong>
              <div className="sparkline">/\\/\\/\\/\\/\\</div>
              <span>Confidence / HIGH</span>
            </div>
            <div className="preview-card radar-card">
              <small>RADAR</small>
              <div className="radar-orbit">◈</div>
              <span>Market movement</span>
            </div>
            <div className="preview-card matches-card">
              <small>MATCH INTELLIGENCE</small>
              <b>3 matches today</b>
              <p>
                Man City vs Arsenal <span>18:30</span>
              </p>
              <p>
                Real Madrid vs Sevilla <span>21:00</span>
              </p>
              <a href="/sign-up">View all matches →</a>
            </div>
          </div>
        </div>
      </section>
      <section id="platform" className="landing-section">
        <div>
          <div className="eyebrow">ONE WORKSPACE</div>
          <h2>
            From market movement
            <br />
            to meaningful context.
          </h2>
        </div>
        <p>
          Every view keeps probability, value, evidence, freshness and
          recommendation state distinct—so the story stays honest.
        </p>
      </section>
      <section className="feature-strip">
        <article>
          <b>01 / EDGE</b>
          <h3>Value with context.</h3>
          <p>
            Compare model probability, fair odds, EV and EDGE score without
            hiding the assumptions.
          </p>
          <a href="/sign-in">Explore EDGE →</a>
        </article>
        <article>
          <b>02 / RADAR</b>
          <h3>Movement, observed.</h3>
          <p>
            Track opening and current prices with freshness-aware evidence. No
            invented money-flow claims.
          </p>
          <a href="/sign-in">Open RADAR →</a>
        </article>
        <article>
          <b>03 / MATCH INTELLIGENCE</b>
          <h3>The full picture.</h3>
          <p>
            One traceable view for lineups, quality, model state and structured
            reasons.
          </p>
          <a href="/sign-in">See intelligence →</a>
        </article>
      </section>
      <section className="landing-cta">
        <div>
          <div className="eyebrow">START WITH THE SIGNAL</div>
          <h2>Build a calmer analysis habit.</h2>
          <p>
            Free beta access is available now. Paid tiers are presented
            transparently and activate only when billing is configured.
          </p>
        </div>
        <a className="button button-primary" href="/sign-up">
          Enter the beta →
        </a>
      </section>
      <footer className="landing-footer">
        <span>
          © VELYQ · AI SPORTS MARKET INTELLIGENCE
          <small className="creator-credit">Created by Joker2face</small>
        </span>
        <span>
          <a href="/terms">Terms</a>
          <a href="/privacy">Privacy</a>
          <a href="/responsible-use">Responsible use</a>
        </span>
      </footer>
    </main>
  );
}
