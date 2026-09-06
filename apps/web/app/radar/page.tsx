import { getLocale } from "../locale";
import { CustomerShell } from "../customer-shell";
import { RadarClient } from "./radar-client";

/**
 * Static shell for RADAR. Prerendered into the asset directory, so serving
 * this page costs no Worker CPU; everything private arrives from the
 * protected API once the page is running.
 */
export default async function Radar() {
  const locale = await getLocale();
  return (
    <CustomerShell active="/radar">
      <RadarClient locale={locale} />
    </CustomerShell>
  );
}
