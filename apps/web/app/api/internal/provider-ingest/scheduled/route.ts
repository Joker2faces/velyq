import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runApiSportsIngestion } from "../../../../../../../tooling/scripts/apisports-ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = process.env["CRON_SECRET"];
  const supplied = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/)?.[1];
  if (!expected || !supplied) return false;
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return (
    expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes)
  );
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
  }

  const date = new Date().toISOString().slice(0, 10);
  try {
    const football = await runApiSportsIngestion({
      sport: "football",
      date,
      commit: true,
    });
    const basketball = await runApiSportsIngestion({
      sport: "basketball",
      date,
      commit: true,
    });
    return NextResponse.json(
      { date, runs: [football, basketball] },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    console.error("scheduled-provider-ingest", {
      code:
        typeof error === "object" && error !== null && "code" in error
          ? String(error.code)
          : "INGESTION_FAILED",
    });
    return NextResponse.json(
      { code: "INGESTION_FAILED" },
      { status: 503, headers: { "cache-control": "private, no-store" } },
    );
  }
}
