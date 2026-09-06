import { getLocale } from "../locale";
import { CustomerShell } from "../customer-shell";
import { AccountClient } from "./account-client";

/**
 * Static shell for Account. Deliberately empty of customer state: identity,
 * plan and subscription all arrive from the protected context API, because
 * this file is served byte-identically to everyone who asks for it.
 */
export default async function Account() {
  const locale = await getLocale();
  return (
    <CustomerShell active="/account">
      <AccountClient locale={locale} />
    </CustomerShell>
  );
}
