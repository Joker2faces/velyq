import { pgSchema } from "drizzle-orm/pg-core";

export const auditSchema = pgSchema("audit");
export const catalogSchema = pgSchema("catalog");
export const intelligenceSchema = pgSchema("intelligence");
export const marketSchema = pgSchema("market");
export const operationsSchema = pgSchema("operations");
export const privateSchema = pgSchema("private");
