import { translate } from "@velyq/ui";
import { getLocale } from "./locale";
import { Card, Skeleton } from "./components/ui";

/** Route-level loading state: a premium skeleton, not a bare sentence. */
export default async function Loading() {
  const locale = await getLocale();
  return (
    <div className="page" style={{ paddingTop: "var(--space-7)" }}>
      <p className="sr-only" role="status" aria-live="polite">
        {translate("customerLoading", locale)}
      </p>
      <div className="stack" aria-hidden="true">
        <Skeleton variant="title" />
        <Skeleton variant="line" width="24rem" />
        <div className="stat-row">
          <Card>
            <Skeleton variant="block" />
          </Card>
          <Card>
            <Skeleton variant="block" />
          </Card>
          <Card>
            <Skeleton variant="block" />
          </Card>
        </div>
        <div className="split">
          <Card>
            <Skeleton variant="block" />
          </Card>
          <Card>
            <Skeleton variant="block" />
          </Card>
        </div>
      </div>
    </div>
  );
}
