import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const seed = readFileSync(
  resolve(import.meta.dirname, "../../../supabase/seed.sql"),
  "utf8",
).toLowerCase();

describe("synthetic provider seed content", () => {
  it("seeds the full fictional catalog and governed provider boundary", () => {
    for (const value of [
      "synthetic fixtures",
      "synthetic_league",
      "north city",
      "south united",
      "east borough",
      "west harbor",
      "synthetic book a",
      "synthetic book b",
      "synthetic-fixtures.v1",
      "mapping.v1",
      "retain_normalized",
      "repository_fixture",
    ]) {
      expect(seed).toContain(value);
    }
  });
});
