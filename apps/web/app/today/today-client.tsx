"use client";

import type { Locale } from "@velyq/ui";
import { useCustomerData } from "../customer/customer-data";
import { CustomerBoundary } from "../customer/customer-boundary";
import type { TodaySurfaceDto } from "../customer/today-surface";
import { TodayView } from "./today-view";

export function TodayClient({ locale }: { locale: Locale }) {
  const state = useCustomerData<TodaySurfaceDto>("/api/v1/today?surface=today");
  return (
    <CustomerBoundary state={state} locale={locale}>
      {(data) => <TodayView locale={locale} data={data} />}
    </CustomerBoundary>
  );
}
