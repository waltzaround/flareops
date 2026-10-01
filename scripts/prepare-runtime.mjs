import { createHash } from "node:crypto";
import {
  readFile,
  writeFile,
  mkdir,
  cp,
  chmod,
  stat,
  rename,
  rm,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { nodeVersion, selectTarget } from "./runtime-config.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = selectTarget(
  process.platform,
  process.arch,
  process.env.TAURI_ENV_TARGET_TRIPLE,
);
const suffix = process.platform === "win32" ? ".exe" : "";
const cache = join(root, ".runtime-cache");
const stage = join(root, "src-tauri/resources/cf-runtime");
const sidecar = join(
  root,
  "src-tauri/binaries",
  `flareops-node-${target.triple}${suffix}`,
);
const packageDir = join(root, "desktop-runtime");
const {
  dependencies: { cf: cfVersion },
} = JSON.parse(await readFile(join(packageDir, "package.json"), "utf8"));
const lock = await readFile(join(packageDir, "package-lock.json"));
const lockHash = createHash("sha256").update(lock).digest("hex");
const identity = { nodeVersion, cfVersion, target: target.triple, lockHash };
let old;
try {
  old = JSON.parse(await readFile(join(stage, "manifest.json"), "utf8"));
} catch {}
function run(exe, args, cwd = root) {
  const result = spawnSync(exe, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, NO_COLOR: "1" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`${exe} exited ${result.status}`);
}
function inspect(exe, args) {
  const result = spawnSync(exe, args, {
    cwd: cache,
    encoding: "utf8",
    timeout: 30_000,
    env: {
      PATH: dirname(exe),
      HOME: process.env.HOME ?? "",
      USERPROFILE: process.env.USERPROFILE ?? "",
      SystemRoot: process.env.SystemRoot ?? "",
      NO_COLOR: "1",
      CI: "1",
      WRANGLER_SEND_METRICS: "false",
    },
  });
  if (result.status !== 0)
    throw Error(
      `Bundled runtime validation failed: ${result.stderr || result.error}`,
    );
  return result.stdout.trim();
}
await mkdir(cache, { recursive: true });
if (
  old &&
  Object.entries(identity).every(([k, v]) => old[k] === v) &&
  (await stat(sidecar).catch(() => null))
) {
  const version = inspect(sidecar, [
    join(stage, "node_modules/cf/bin/cf"),
    "--version",
  ]);
  console.log(
    `Bundled cf ${version.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/)?.[0] ?? version} / Node ${nodeVersion} already prepared for ${target.triple}.`,
  );
  process.exit(0);
}
const filename = `node-v${nodeVersion}-${target.archive}`;
const archivePath = join(cache, filename);
let archive;
try {
  archive = await readFile(archivePath);
} catch {}
if (
  !archive ||
  createHash("sha256").update(archive).digest("hex") !== target.sha256
) {
  console.log(`Downloading official Node ${nodeVersion} for ${target.triple}…`);
  const response = await fetch(
    `https://nodejs.org/dist/v${nodeVersion}/${filename}`,
    { signal: AbortSignal.timeout(180_000) },
  );
  if (!response.ok) throw Error(`Node download failed: ${response.status}`);
  archive = Buffer.from(await response.arrayBuffer());
  if (createHash("sha256").update(archive).digest("hex") !== target.sha256)
    throw Error("Node archive checksum mismatch. Nothing will be bundled.");
  await writeFile(archivePath, archive);
}
run("tar", ["-xf", archivePath, "-C", cache]);
const extracted = join(
  cache,
  `node-v${nodeVersion}-${target.archive.replace(/\.(tar\.gz|zip)$/, "")}`,
);
const node = join(
  extracted,
  process.platform === "win32" ? "node.exe" : "bin/node",
);
if (inspect(node, ["--version"]) !== `v${nodeVersion}`)
  throw Error("Unexpected Node runtime version.");
if (!process.env.npm_execpath)
  throw Error("Run this script with npm run desktop:prepare.");
console.log(
  `Installing locked cf ${cfVersion} dependencies locally (no lifecycle scripts)…`,
);
run(
  process.execPath,
  [
    process.env.npm_execpath,
    "ci",
    "--omit=dev",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
  ],
  packageDir,
);
const next = stage + ".next";
await rm(next, { recursive: true, force: true });
await mkdir(next, { recursive: true });
await cp(join(packageDir, "node_modules"), join(next, "node_modules"), {
  recursive: true,
  dereference: true,
});
await cp(join(packageDir, "package.json"), join(next, "package.json"));
await cp(
  join(packageDir, "package-lock.json"),
  join(next, "package-lock.json"),
);
await cp(join(extracted, "LICENSE"), join(next, "NODE-LICENSE"));
await mkdir(dirname(sidecar), { recursive: true });
await cp(node, sidecar);
if (process.platform !== "win32") await chmod(sidecar, 0o755);
const actual = inspect(sidecar, [
  join(next, "node_modules/cf/bin/cf"),
  "--version",
]);
if (actual.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/)?.[0] !== cfVersion)
  throw Error(`Expected cf ${cfVersion}; got ${actual}.`);
// Account-free smoke check; no login or cloud resources are accessed.
const schema = JSON.parse(
  inspect(sidecar, [
    join(next, "node_modules/cf/bin/cf"),
    "schema",
    "dns",
    "records",
    "create",
  ]),
);
if (schema.httpMethod !== "POST")
  throw Error("Bundled CLI schema smoke check failed.");
await writeFile(
  join(next, "manifest.json"),
  JSON.stringify(
    {
      ...identity,
      archiveSha256: target.sha256,
      preparedAt: new Date().toISOString(),
    },
    null,
    2,
  ) + "\n",
);
await rm(stage, { recursive: true, force: true });
await rename(next, stage);
console.log(
  `Prepared cf ${cfVersion} + Node ${nodeVersion}. No system installation required.`,
);
