import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
// fileURLToPath handles drive letters and spaces on Windows.
import { fileURLToPath } from "node:url";
const paths = readdirSync(new URL(".", import.meta.url))
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => fileURLToPath(new URL(name, import.meta.url)));
const result = spawnSync(process.execPath, ["--test", ...paths], {
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
