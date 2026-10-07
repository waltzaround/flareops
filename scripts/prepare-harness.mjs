import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "harness");
const stage = join(root, "src-tauri/resources/harness-runtime");
if (!process.env.npm_execpath)
  throw Error(
    "Run via npm run desktop:build or npm run desktop:prepare-harness.",
  );
const install = spawnSync(
  process.execPath,
  [process.env.npm_execpath, "ci", "--no-audit", "--no-fund"],
  { cwd: source, stdio: "inherit" },
);
if (install.status !== 0) process.exit(install.status ?? 1);
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
// Explicit allowlist excludes local credentials, .wrangler state, and test artifacts.
for (const name of [
  "src",
  "node_modules",
  "wrangler.jsonc",
  "Dockerfile",
  "package.json",
  "package-lock.json",
]) {
  await cp(join(source, name), join(stage, name), {
    recursive: true,
    dereference: true,
  });
}
console.log("Bundled backend deployment runtime prepared.");
