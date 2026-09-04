import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(packageRoot, "src/mock/fixtures");
const target = resolve(packageRoot, "dist/mock/fixtures");

await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
