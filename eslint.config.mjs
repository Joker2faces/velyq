import eslint from "@eslint/js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import globals from "globals";
import ts from "typescript";
import tseslint from "typescript-eslint";

const workspaceDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceUnitDirectories = new Set(["apps", "packages", "workers"]);
const decimalPackageDirectory = path.join(
  workspaceDirectory,
  "packages",
  "decimal",
);
const typeAwareFiles = [
  "apps/**/*.{ts,tsx,mts}",
  "packages/**/*.{ts,tsx,mts}",
  "workers/**/*.{ts,tsx,mts}",
];

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
        const parserServices = context.sourceCode.parserServices;
        const typeNodeMap = parserServices?.esTreeNodeToTSNodeMap;

        if (!parserServices?.program || !typeNodeMap) {
          throw new Error(
            "velyq/no-branded-decimal-arithmetic requires TypeScript parser services.",
          );
        }

        const checker = parserServices.program.getTypeChecker();

        function belongsToDecimalString(declaration) {
          if (
            workspaceUnitDirectory(declaration.getSourceFile().fileName) !==
            decimalPackageDirectory
          ) {
            return false;
          }

          for (
            let ancestor = declaration.parent;
            ancestor && !ts.isSourceFile(ancestor);
            ancestor = ancestor.parent
          ) {
            if (ts.isTypeAliasDeclaration(ancestor)) {
              return ancestor.name.text === "DecimalString";
            }
          }

          return false;
        }

        function hasDecimalStringBrand(type, seenTypes = new Set()) {
          if (seenTypes.has(type)) return false;
          seenTypes.add(type);

          if (
            type.flags &
            (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.Never)
          ) {
            return false;
          }

          if (
            type.isUnionOrIntersection() &&
            type.types.some((part) => hasDecimalStringBrand(part, seenTypes))
          ) {
            return true;
          }

          if (
            checker
              .getPropertiesOfType(type)
              .some((property) =>
                property
                  .getDeclarations()
                  ?.some((declaration) => belongsToDecimalString(declaration)),
              )
          ) {
            return true;
          }

          const constraint = checker.getBaseConstraintOfType(type);
          return (
            constraint !== undefined &&
            constraint !== type &&
            hasDecimalStringBrand(constraint, seenTypes)
          );
        }

        function isBrandedDecimal(node) {
          const typeNode = typeNodeMap.get(node);
          return (
            typeNode !== undefined &&
            hasDecimalStringBrand(checker.getTypeAtLocation(typeNode))
          );
        }

        return {
          BinaryExpression(node) {
            if (
              arithmeticOperators.has(node.operator) &&
              (isBrandedDecimal(node.left) || isBrandedDecimal(node.right))
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
      "**/eslint-fixtures/**",
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
    },
  },
  {
    files: typeAwareFiles,
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["packages/*/test/*.ts"],
          defaultProject: "tsconfig.json",
        },
        tsconfigRootDir: workspaceDirectory,
      },
    },
    rules: {
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
