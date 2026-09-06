import { NextResponse } from "next/server";
import { requireCustomerSession } from "../../auth";
import {
  customerService,
  resolveCustomerContext,
  unavailable,
} from "../../../customer-runtime";

/**
 * Which product surface is asking, and what it needs to see.
 *
 * The preview surfaces show three matches and withhold the rest. That used to
 * happen in the page, which was safe only while the pages were server
 * rendered — this API returned the whole list to anyone holding `today.view`,
 * which FREE has, so the UI hid what the API handed over. With the customer
 * UI served as static shells this is the only boundary left, so the slice is
 * applied here.
 */
const SURFACES = {
  today: { full: "today.view", preview: "today.view" },
  edge: { full: "edge.full", preview: "edge.preview" },
  radar: { full: "radar.full", preview: "radar.preview" },
} as const;

const PREVIEW_MATCH_LIMIT = 3;

type Surface = keyof typeof SURFACES;

function surfaceOf(request: Request): Surface {
  const requested = new URL(request.url).searchParams.get("surface");
  return requested === "edge" || requested === "radar" ? requested : "today";
}

export async function GET(request: Request) {
  const surface = surfaceOf(request);
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  /*
   * Gate on the *preview* entitlement: it is the minimum needed to see the
   * surface at all. Whether the caller also gets the full list is decided
   * below from their own grants — never from anything in the request.
   */
  const denied = await requireCustomerSession(
    request,
    SURFACES[surface].preview,
  );
  if (denied) return denied;

  /*
   * The non-redirecting resolver: this is an API, so an unauthenticated
   * caller must get a status code, not a navigation.
   */
  const context = await resolveCustomerContext(
    request.headers.get("cookie") ?? "",
  );
  const entitlements: readonly string[] = context?.entitlements ?? [];
  const full = entitlements.includes(SURFACES[surface].full);

  const service = await customerService();
  if (!service)
    return NextResponse.json(unavailable(requestId), {
      status: 503,
      headers: {
        "content-type": "application/problem+json",
        "x-request-id": requestId,
      },
    });
  try {
    const result = await service.getToday(new Date());
    if (!result.ok)
      return NextResponse.json(
        {
          ...result,
          type: "https://velyq.dev/problems/customer-unavailable",
          title: "Customer data is temporarily unavailable",
          status: 503,
          requestId,
        },
        {
          status: 503,
          headers: {
            "content-type": "application/problem+json",
            "x-request-id": requestId,
          },
        },
      );

    const all = result.value.matches;
    const visible = full ? all : all.slice(0, PREVIEW_MATCH_LIMIT);
    return NextResponse.json(
      {
        ...result.value,
        matches: visible,
        /*
         * The count only — enough for the UI to say "4 more on PRO" without
         * the withheld rows ever crossing the wire.
         */
        withheld: all.length - visible.length,
        surface,
        full,
      },
      {
        // Customer-specific and entitlement-shaped: never shared or stored.
        headers: { "cache-control": "private, no-store" },
      },
    );
  } finally {
    await service.close();
  }
}
