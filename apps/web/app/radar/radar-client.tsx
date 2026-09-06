"use client";

import type { Locale } from "@velyq/ui";
import { useCustomerData } from "../customer/customer-data";
import { CustomerBoundary } from "../customer/customer-boundary";
import type { TodaySurfaceDto } from "../customer/today-surface";
import { RadarView } from "./radar-view";

export function RadarClient({ locale }: { locale: Locale }) {
  const state = useCustomerData<TodaySurfaceDto>("/api/v1/today?surface=radar");
  return (
    <CustomerBoundary state={state} locale={locale}>
      {(data) => <RadarView locale={locale} data={data} />}
    </CustomerBoundary>
  );
}
