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
          <h2>Customer preview</h2>
          <p>Entitlement interface placeholder · read-only staging access.</p>
        </div>
        <Status tone="synthetic">SYNTHETIC DATA</Status>
      </section>
    </CustomerShell>
  );
}
