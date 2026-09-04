const stage = process.argv[2] ?? "reserved-stage";

console.error(
  `${stage} is reserved for a later milestone and intentionally unavailable.`,
);
process.exitCode = 1;
