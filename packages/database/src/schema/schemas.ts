import { pgSchema } from "drizzle-orm/pg-core";

export const auditSchema = pgSchema("audit");
export const catalogSchema = pgSchema("catalog");
export const intelligenceSchema = pgSchema("intelligence");
export const marketSchema = pgSchema("market");
export const operationsSchema = pgSchema("operations");
export const privateSchema = pgSchema("private");
/* Historical training corpus. Deliberately not part of the operational
   catalog: see packages/database/src/schema/research.ts. */
export const researchSchema = pgSchema("research");
