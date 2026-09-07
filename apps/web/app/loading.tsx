import { translate } from "@velyq/ui";
import { getLocale } from "./locale";
import { SurfaceSkeleton } from "./components/ui";

/**
 * Route-level loading state.
 *
 * Deliberately the same skeleton the client boundary renders, so a soft
 * navigation and a cold load present one shape rather than two guesses at the
 * page — but with no title. This boundary covers the marketing routes as well
 * as the customer app, and those render their own `h1`; supplying one here
 * gave the homepage and the pricing page two top-level headings.
 */
export default async function Loading() {
  const locale = await getLocale();
  return <SurfaceSkeleton label={translate("customerLoading", locale)} />;
}
