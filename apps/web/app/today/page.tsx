import { getLocale } from "../locale";
import { CustomerShell } from "../customer-shell";
import { TodayClient } from "./today-client";

/**
 * Static shell for Today. Prerendered into the asset directory, so no Worker
 * CPU is spent serving it. The snapshot itself is fetched per visit, which is
 * what keeps Today rolling rather than frozen at build time.
 */
export default async function Today() {
  const locale = await getLocale();
  return (
    <CustomerShell active="/today">
      <TodayClient locale={locale} />
    </CustomerShell>
  );
}
