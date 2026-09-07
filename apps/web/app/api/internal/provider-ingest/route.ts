import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runApiSportsIngestion } from "../../../../../../tooling/scripts/apisports-ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let ingestionInFlight = false;

function authorized(request: Request) {
  const expected = process.env["VELYQ_INGEST_SECRET"];
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

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
  }
  if (ingestionInFlight) {
    return NextResponse.json(
      { code: "INGESTION_IN_PROGRESS" },
      { status: 409 },
    );
  }

  const input = (await request.json().catch(() => null)) as {
    sport?: unknown;
    date?: unknown;
  } | null;
  const sport = input?.sport;
  const date = input?.date;
  if (
    (sport !== "football" && sport !== "basketball") ||
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  ) {
    return NextResponse.json({ code: "INVALID_REQUEST" }, { status: 400 });
  }

  ingestionInFlight = true;
  try {
    const result = await runApiSportsIngestion({ sport, date, commit: true });
    return NextResponse.json(result, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch {
    return NextResponse.json(
      { code: "INGESTION_FAILED" },
      {
        status: 503,
        headers: { "cache-control": "private, no-store" },
      },
    );
  } finally {
    ingestionInFlight = false;
  }
}
