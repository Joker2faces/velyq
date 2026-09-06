"use client";

import { translate, type Locale } from "@velyq/ui";
import { IconShield } from "../components/icons";
import { useCustomerData } from "./customer-data";

type CustomerContext = { isAdmin: boolean };

/**
 * The operations console link, shown only to a principal that actually holds
 * `admin.access`.
 *
 * This used to be decided in the shell from a server-resolved context. The
 * shell is a static asset now, and `isAdmin` is authorization state: baking
 * it into a file served to every visitor would both leak it and be wrong for
 * whoever loaded the file next. It is resolved per session instead, from the
 * customer's own context API.
 *
 * Nothing here grants access. The admin application resolves permissions
 * server-side on its own; hiding or showing a link changes only whether it
 * is offered.
 */
export function AdminConsoleLink({ locale }: { locale: Locale }) {
  const adminUrl = process.env["NEXT_PUBLIC_VELYQ_ADMIN_URL"];
  const state = useCustomerData<CustomerContext>("/api/v1/customer/context");
  if (!adminUrl) return null;
  if (state.status !== "ready" || !state.data.isAdmin) return null;
  return (
    <a className="button button--ghost button--block" href={adminUrl}>
      <IconShield size={15} />
      {translate("adminConsole", locale)}
    </a>
  );
}
