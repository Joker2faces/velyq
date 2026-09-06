import { getLocale } from "../locale";
import { CustomerShell } from "../customer-shell";
import { EdgeClient } from "./edge-client";

/**
 * Static shell for EDGE.
 *
 * Rendered once at build time into the Cloudflare asset directory, so the
 * Worker is never invoked to serve this page — the app's SSR costs more CPU
 * than the Workers Free allowance grants, and paying it per page view is what
 * took the site down under load.
 *
 * Nothing customer-specific is rendered here. The shell is one file served
 * to everyone: the data, the entitlement boundary and even whether the
 * visitor is signed in all come from the protected API once the page is
 * running.
 */
export default async function Edge() {
  const locale = await getLocale();
  return (
    <CustomerShell active="/edge">
      <EdgeClient locale={locale} />
    </CustomerShell>
  );
}
