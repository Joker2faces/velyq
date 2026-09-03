import eslint from "@eslint/js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import globals from "globals";
import tseslint from "typescript-eslint";

const workspaceDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceUnitDirectories = new Set(["apps", "packages", "workers"]);

function workspaceUnitDirectory(filePath) {
  const relativePath = path.relative(
    workspaceDirectory,
    path.resolve(filePath),
  );
  const [directory, unit] = relativePath.split(path.sep);

  if (
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath) ||
    !directory ||
    !unit ||
    !workspaceUnitDirectories.has(directory)
  ) {
    return undefined;
  }

  return path.join(workspaceDirectory, directory, unit);
}

const workspaceBoundaryPlugin = {
  rules: {
    "no-cross-package-relative-import": {
      meta: {
        type: "problem",
        docs: {
          description:
            "disallow relative filesystem imports that cross workspace package boundaries",
        },
        schema: [],
        messages: {
          crossPackage:
            "Import from a package public entry point, never another workspace unit's filesystem path.",
        },
      },
      create(context) {
        const importerUnitDirectory = workspaceUnitDirectory(context.filename);

        function checkSource(source) {
          if (
            !importerUnitDirectory ||
            typeof source.value !== "string" ||
            !source.value.startsWith(".")
          ) {
            return;
          }

          const importedUnitDirectory = workspaceUnitDirectory(
            path.resolve(path.dirname(context.filename), source.value),
          );

          if (
            importedUnitDirectory &&
            importedUnitDirectory !== importerUnitDirectory
          ) {
            context.report({ node: source, messageId: "crossPackage" });
          }
        }

        return {
          ImportDeclaration(node) {
            checkSource(node.source);
          },
          ImportExpression(node) {
            checkSource(node.source);
          },
          ExportAllDeclaration(node) {
            checkSource(node.source);
          },
          ExportNamedDeclaration(node) {
            if (node.source) {
              checkSource(node.source);
            }
          },
        };
      },
    },
    "no-branded-decimal-arithmetic": {
      meta: {
        type: "problem",
        docs: {
          description:
            "disallow direct arithmetic on decimal value-object fields",
        },
        schema: [],
        messages: {
          directArithmetic:
            "Use @velyq/decimal helpers instead of direct arithmetic on decimal fields.",
        },
      },
      create(context) {
        const arithmeticOperators = new Set(["+", "-", "*", "/", "%", "**"]);

        function isDecimalField(node) {
          return (
            node.type === "MemberExpression" &&
            !node.computed &&
            node.property.type === "Identifier" &&
            (node.property.name === "value" || node.property.name === "amount")
          );
        }

        return {
          BinaryExpression(node) {
            if (
              arithmeticOperators.has(node.operator) &&
              (isDecimalField(node.left) || isDecimalField(node.right))
            ) {
              context.report({ node, messageId: "directArithmetic" });
            }
          },
        };
      },
    },
  },
};

const internalPackageImports = [
  {
    group: ["@velyq/*/src/**"],
    message:
      "Import from a package public entry point, never its src internals.",
  },
];

const decimalRuntimeForbiddenImports = [
  {
    name: "decimal.js",
    message:
      "Only @velyq/decimal may import decimal.js; use its public value objects and helpers.",
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
    plugins: {
      velyq: workspaceBoundaryPlugin,
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: decimalRuntimeForbiddenImports,
          patterns: internalPackageImports,
        },
      ],
      "velyq/no-cross-package-relative-import": "error",
      "velyq/no-branded-decimal-arithmetic": "error",
    },
  },
  {
    files: ["packages/decimal/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: internalPackageImports }],
      "velyq/no-branded-decimal-arithmetic": "off",
    },
  },
  {
    files: ["packages/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...decimalRuntimeForbiddenImports, ...domainForbiddenImports],
          patterns: [...internalPackageImports, ...domainForbiddenSubpaths],
        },
      ],
    },
  },
);
