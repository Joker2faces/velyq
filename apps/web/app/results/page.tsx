import { CustomerShell } from "../customer-shell";
import { getLocale } from "../locale";
import { ResultsClient } from "./results-client";

export default async function ResultsPage() {
  return (
    <CustomerShell active="/results">
      <ResultsClient locale={await getLocale()} />
    </CustomerShell>
  );
}
