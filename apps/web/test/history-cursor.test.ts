import { describe, expect, it } from "vitest";
import {
  decodeHistoryCursor,
  encodeHistoryCursor,
} from "../app/customer/history-cursor";

describe("history cursor codec", () => {
  it("round-trips a real cursor", () => {
    const cursor = {
      createdAt: new Date("2026-09-10T12:00:00.000Z"),
      id: "decision-1",
    };
    const decoded = decodeHistoryCursor(encodeHistoryCursor(cursor));
    expect(decoded).toEqual(cursor);
  });

  it("treats a missing cursor as the first page", () => {
    expect(decodeHistoryCursor(null)).toBeUndefined();
  });

  it("treats a malformed cursor as the first page rather than erroring", () => {
    expect(decodeHistoryCursor("not-valid-base64url-json")).toBeUndefined();
    expect(
      decodeHistoryCursor(Buffer.from("{}").toString("base64url")),
    ).toBeUndefined();
    expect(
      decodeHistoryCursor(
        Buffer.from(
          JSON.stringify({ createdAt: "not-a-date", id: "x" }),
        ).toString("base64url"),
      ),
    ).toBeUndefined();
  });
});
