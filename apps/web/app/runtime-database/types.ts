export type RuntimeDatabaseSource =
  | { kind: "node"; connectionString: string }
  | { kind: "hyperdrive"; connectionString: string };
