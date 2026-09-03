import { describe, expect, it } from "vitest";

import {
  syntheticProviderFixtureIds,
  syntheticReplaySequences,
} from "../src/index.js";

describe("synthetic provider test identities", () => {
  it("publishes stable fictional identities for downstream integration tests", () => {
    expect(syntheticProviderFixtureIds).toEqual({
      providerId: "30000000-0000-4000-8000-000000000001",
      competitionId: "21000000-0000-4000-8000-000000000001",
      eventIds: [
        "23000000-0000-4000-8000-000000000001",
        "23000000-0000-4000-8000-000000000002",
      ],
      teamIds: [
        "22000000-0000-4000-8000-000000000001",
        "22000000-0000-4000-8000-000000000002",
        "22000000-0000-4000-8000-000000000003",
        "22000000-0000-4000-8000-000000000004",
      ],
      bookmakerIds: [
        "45000000-0000-4000-8000-000000000001",
        "45000000-0000-4000-8000-000000000002",
      ],
    });
  });

  it("publishes the fixed repository sequence names and declared hashes", () => {
    expect(syntheticReplaySequences).toEqual([
      {
        name: "sequence-01-opening",
        contentHash:
          "sha256:4da5724ee6a5626f3295fa58453c6675a63603dbde12b43c35bbb6c185e2fefe",
      },
      {
        name: "sequence-02-movement",
        contentHash:
          "sha256:18c146aa7d73cc093ecffdc2ca31f009ef6662e18a9ea150297bda2f55101446",
      },
      {
        name: "sequence-03-lineup-change",
        contentHash:
          "sha256:2f22cd5391b7cc4ae9a88892a5e722bb869adba7130dd590625c5f63638a7e1d",
      },
      {
        name: "sequence-04-repriced",
        contentHash:
          "sha256:77fd47390e16b93efec2778f2a14094c9dda406586b5e9713ee630e7d999a7b6",
      },
    ]);
  });
});
