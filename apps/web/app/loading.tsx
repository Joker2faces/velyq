import { translate } from "@velyq/ui";
import { getLocale } from "./locale";
import { SurfaceSkeleton } from "./components/ui";

/**
 * Route-level loading state.
 *
 * Deliberately the same skeleton the client boundary renders, so a soft
 * navigation and a cold load present one shape rather than two different
 * guesses at the page.
 */
export default async function Loading() {
  const locale = await getLocale();
  return <SurfaceSkeleton label={translate("customerLoading", locale)} />;
}
