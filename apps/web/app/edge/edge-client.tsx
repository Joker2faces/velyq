"use client";

import type { Locale } from "@velyq/ui";
import { useCustomerData } from "../customer/customer-data";
import { CustomerBoundary } from "../customer/customer-boundary";
import type { TodaySurfaceDto } from "../customer/today-surface";
import { EdgeView } from "./edge-view";

/**
 * Asks the EDGE surface of the protected API and renders whatever it is
 * allowed to. The `surface` tells the server which product boundary applies;
 * the server decides from the customer's entitlements whether that means the
 * full table or the preview.
 */
export function EdgeClient({ locale }: { locale: Locale }) {
  const state = useCustomerData<TodaySurfaceDto>("/api/v1/today?surface=edge");
  return (
    <CustomerBoundary state={state} locale={locale}>
      {(data) => <EdgeView locale={locale} data={data} />}
    </CustomerBoundary>
  );
}
