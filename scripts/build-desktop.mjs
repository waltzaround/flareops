import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { selectTarget } from "./runtime-config.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const targetIndex = args.indexOf("--target");
selectTarget(
  process.platform,
  process.arch,
  targetIndex >= 0
    ? args[targetIndex + 1]
    : (args.find((arg) => arg.startsWith("--target="))?.slice(9) ??
        process.env.CARGO_BUILD_TARGET),
);
const prepare = spawnSync(
  process.execPath,
  [resolve(root, "scripts/prepare-runtime.mjs")],
  { cwd: root, stdio: "inherit" },
);
if (prepare.status !== 0) process.exit(prepare.status ?? 1);
const build = spawnSync(
  process.execPath,
  [
    resolve(root, "node_modules/@tauri-apps/cli/tauri.js"),
    "build",
    "--config",
    "src-tauri/tauri.bundled.conf.json",
    ...args,
  ],
  { cwd: root, stdio: "inherit" },
);
process.exit(build.status ?? 1);
