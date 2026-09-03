import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const internalPackageImports = [
  {
    group: ["@velyq/*/src/**"],
    message:
      "Import from a package public entry point, never its src internals.",
  },
];

const domainForbiddenImports = [
  { name: "next", message: "Domain code must remain framework-free." },
  {
    name: "@supabase/supabase-js",
    message: "Domain code must not access Supabase.",
  },
  { name: "drizzle-orm", message: "Domain code must not access Drizzle." },
  {
    name: "@velyq/providers",
    message: "Domain code must not consume provider payloads.",
  },
  { name: "@velyq/ui", message: "Domain code must not depend on UI." },
];

const domainForbiddenSubpaths = [
  { group: ["next/**"], message: "Domain code must remain framework-free." },
  {
    group: ["@supabase/supabase-js/**"],
    message: "Domain code must not access Supabase.",
  },
  {
    group: ["drizzle-orm/**"],
    message: "Domain code must not access Drizzle.",
  },
  {
    group: ["@velyq/providers/**"],
    message: "Domain code must not consume provider payloads.",
  },
  { group: ["@velyq/ui/**"], message: "Domain code must not depend on UI." },
];

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      "tooling/test/fixtures/**",
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["**/*.mjs", "**/*.mts"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: internalPackageImports }],
    },
  },
  {
    files: ["packages/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: domainForbiddenImports,
          patterns: [...internalPackageImports, ...domainForbiddenSubpaths],
        },
      ],
    },
  },
);
