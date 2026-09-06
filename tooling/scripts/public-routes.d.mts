/**
 * Types for the shared prerender route list.
 *
 * The list itself is plain `.mjs` because the build step runs it under Node
 * without a TypeScript pipeline, but the application imports it too — via
 * `apps/web/test/locale-path.test.ts` — to prove the routes it links and the
 * routes the build actually writes are the same set.
 */
export declare const PUBLIC_ROUTES: readonly string[];
export declare const LOCALES: readonly { code: string; prefix: string }[];
