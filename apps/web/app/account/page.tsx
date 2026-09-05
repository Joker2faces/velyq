import { CustomerShell, Status } from "../customer-shell";
export default function Account() {
  return (
    <CustomerShell>
      <div className="page-heading">
        <div>
          <p className="kicker">ACCOUNT</p>
          <h1>Your workspace.</h1>
          <p>Your VELYQ customer workspace and access context.</p>
        </div>
      </div>
      <section className="panel account-panel">
        <div>
          <span className="kicker">PLAN</span>
          <h2>FREE synthetic beta</h2>
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
        <p>
          Paid billing is not active in the current beta. Your FREE access
          remains fully usable.
        </p>
      </section>
    </CustomerShell>
  );
}
