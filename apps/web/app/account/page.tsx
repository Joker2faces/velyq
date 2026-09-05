import { CustomerShell, Status } from "../customer-shell";
export default function Account() {
  return (
    <CustomerShell>
      <div className="page-heading">
        <div>
          <p className="kicker">ACCOUNT</p>
          <h1>Your workspace.</h1>
          <p>Access and data context for this staging environment.</p>
        </div>
      </div>
      <section className="panel account-panel">
        <div>
          <span className="kicker">PLAN</span>
          <h2>FREE customer preview</h2>
          <p>
            Today, EDGE preview and RADAR preview are available. Paid access is
            confirmed server-side by Stripe webhooks.
          </p>
        </div>
        <Status tone="synthetic">SYNTHETIC DATA</Status>
      </section>
      <section className="panel">
        <span className="kicker">BILLING</span>
        <h2>Manage your subscription</h2>
        <p>Checkout and billing management are hosted securely by Stripe.</p>
        <form action="/api/v1/billing/portal" method="post">
          <button type="submit">Manage billing</button>
        </form>
      </section>
    </CustomerShell>
  );
}
