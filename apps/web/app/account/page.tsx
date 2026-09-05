import { CustomerShell, Status } from "../customer-shell";
import { loadCustomerContext } from "../customer-runtime";
export default async function Account() {
  const context = await loadCustomerContext();
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
          <h2>{context?.plan ?? "FREE"} synthetic beta</h2>
          <p>
            Signed in as {context?.email ?? "authenticated customer"}. Access is
            resolved server-side.
          </p>
        </div>
        <div>
          <Status tone="synthetic">SYNTHETIC DATA</Status>
          {context?.isAdmin ? (
            <Status tone="heuristic">ADMIN ACCESS</Status>
          ) : null}
        </div>
      </section>
      <section className="panel">
        <span className="kicker">BILLING</span>
        <h2>Subscription</h2>
        <p>
          Status: {context?.status ?? "FREE / not subscribed"}. Entitlements:{" "}
          {context?.entitlements.join(", ") ?? "customer access"}.
        </p>
        <p>
          Paid billing is not active in the current beta. Your FREE access
          remains fully usable.
        </p>
      </section>
    </CustomerShell>
  );
}
