import { CustomerShell } from "../customer-shell";

const plans = [
  [
    "FREE",
    "A clear preview of the current synthetic intelligence",
    "Today, EDGE preview, RADAR preview",
  ],
  [
    "PRO",
    "Expanded customer intelligence for active analysis",
    "Full EDGE, full RADAR, Match Intelligence",
  ],
  [
    "ELITE",
    "The complete current customer intelligence experience",
    "Full EDGE, full RADAR, Match Intelligence",
  ],
] as const;

export default function Pricing() {
  return (
    <CustomerShell>
      <div className="page-heading">
        <div>
          <p className="kicker">PLANS</p>
          <h1>Choose your intelligence access.</h1>
          <p>
            Plans control customer features only. They never grant
            administrative access.
          </p>
        </div>
      </div>
      <div className="card-grid">
        {plans.map(([name, description, access]) => (
          <section className="panel" key={name}>
            <p className="kicker">{name}</p>
            <h2>{description}</h2>
            <p>{access}</p>
            {name === "FREE" ? (
              <span className="status">Current preview</span>
            ) : (
              <form action="/api/v1/billing/checkout" method="post">
                <input type="hidden" name="plan" value={name} />
                <button type="submit">Start {name} checkout</button>
              </form>
            )}
          </section>
        ))}
      </div>
      <p className="fine-print">
        Phase 1 data is synthetic. Predictions are experimental; EDGE and RADAR
        are development heuristics. Prices appear only after approved Stripe
        Price IDs are configured.
      </p>
    </CustomerShell>
  );
}
