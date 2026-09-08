"use client";
import type { Locale } from "@velyq/ui";
import { CustomerBoundary } from "../customer/customer-boundary";
import { useCustomerData } from "../customer/customer-data";
import type { HistorySurfaceDto } from "../customer/history-surface";
import { ResultsView } from "./results-view";
export function ResultsClient({ locale }: { locale: Locale }) {
  const state = useCustomerData<HistorySurfaceDto>("/api/v1/history");
  return (
    <CustomerBoundary state={state} locale={locale}>
      {(data) => <ResultsView data={data} locale={locale} />}
    </CustomerBoundary>
  );
}
