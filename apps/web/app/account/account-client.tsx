"use client";

import type { Locale } from "@velyq/ui";
import { useCustomerData } from "../customer/customer-data";
import { CustomerBoundary } from "../customer/customer-boundary";
import type { CustomerContextDto } from "../customer/customer-context";
import { AccountView } from "./account-view";

export function AccountClient({ locale }: { locale: Locale }) {
  const state = useCustomerData<CustomerContextDto>("/api/v1/customer/context");
  return (
    <CustomerBoundary state={state} locale={locale}>
      {(context) => <AccountView locale={locale} context={context} />}
    </CustomerBoundary>
  );
}
