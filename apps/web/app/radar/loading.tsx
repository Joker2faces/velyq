import { translate } from "@velyq/ui";
import { getLocale } from "../locale";
import { CustomerShell } from "../customer-shell";
import { SurfaceSkeleton } from "../components/ui";

/**
 * Loading boundary for RADAR.
 *
 * Inside the shell deliberately. The root boundary sits above it, so a soft
 * navigation between customer surfaces flashed a skeleton with no sidebar and
 * no top bar before the shell came back — the whole chrome disappearing and
 * reappearing for one frame. Owning the boundary here keeps the navigation
 * fixed and lets the skeleton name the surface being opened.
 */
export default async function Loading() {
  const locale = await getLocale();
  return (
    <CustomerShell active="/radar">
      <SurfaceSkeleton
        label={translate("customerLoading", locale)}
        title={translate("radarTitle", locale)}
      />
    </CustomerShell>
  );
}
