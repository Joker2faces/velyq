export const databaseTestIdentities = Object.freeze({
  adminUserId: "00000000-0000-4000-8000-000000000003",
  otherUserId: "00000000-0000-4000-8000-000000000002",
  ownerUserId: "00000000-0000-4000-8000-000000000001",
});

export const syntheticProviderFixtureIds = Object.freeze({
  providerId: "30000000-0000-4000-8000-000000000001",
  competitionId: "21000000-0000-4000-8000-000000000001",
  eventIds: Object.freeze([
    "23000000-0000-4000-8000-000000000001",
    "23000000-0000-4000-8000-000000000002",
  ]),
  teamIds: Object.freeze([
    "22000000-0000-4000-8000-000000000001",
    "22000000-0000-4000-8000-000000000002",
    "22000000-0000-4000-8000-000000000003",
    "22000000-0000-4000-8000-000000000004",
  ]),
  bookmakerIds: Object.freeze([
    "45000000-0000-4000-8000-000000000001",
    "45000000-0000-4000-8000-000000000002",
  ]),
});

export const syntheticReplaySequences = Object.freeze([
  Object.freeze({
    name: "sequence-01-opening",
    contentHash:
      "sha256:fc9835303008b24c3c1735ac931a82c04ea69f7e751e5600927916d2d5a11c2e",
  }),
  Object.freeze({
    name: "sequence-02-movement",
    contentHash:
      "sha256:150cfd25a412920149808f1c919773ea606f05c9c17193bce96d9ca22cf5ac2e",
  }),
  Object.freeze({
    name: "sequence-03-lineup-change",
    contentHash:
      "sha256:d780bb0b2a2ee36155753db851ea64e9b126a5ac11f2237f8fa947d2dec693ab",
  }),
  Object.freeze({
    name: "sequence-04-repriced",
    contentHash:
      "sha256:4efcf52964764f53695fc6ecb447bc2197f906e4d6e32ed1532fda7b9d420912",
  }),
]);
