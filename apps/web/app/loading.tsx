import { CustomerShell } from "./customer-shell";
import { message } from "@velyq/ui";

export default function Loading() {
  return (
    <CustomerShell>
      <div className="panel" role="status" aria-live="polite" aria-busy="true">
        {message("customerLoading")}
      </div>
    </CustomerShell>
  );
}
