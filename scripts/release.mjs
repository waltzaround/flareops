import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  readFile,
  writeFile,
  mkdir,
  readdir,
  copyFile,
  stat,
} from "node:fs/promises";
import { dirname, resolve, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

export const releaseTargets = {
  "aarch64-apple-darwin": {
    platform: "macos",
    arch: "arm64",
    extensions: [".dmg"],
  },
  "x86_64-apple-darwin": {
    platform: "macos",
    arch: "x64",
    extensions: [".dmg"],
  },
  "x86_64-pc-windows-msvc": {
    platform: "windows",
    arch: "x64",
    extensions: [".exe"],
  },
  "x86_64-unknown-linux-gnu": {
    platform: "linux",
    arch: "x64",
    extensions: [".deb", ".AppImage"],
  },
};
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
export function validateVersion(values, tag) {
  const version = values[0];
  if (
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(
      version,
    )
  )
    throw Error("Invalid release version.");
  if (values.some((value) => value !== version))
    throw Error(
      "Versions differ between package.json, package-lock.json, Cargo.toml, Cargo.lock and tauri.conf.json.",
    );
  if (tag && tag !== `v${version}`)
    throw Error(`Release tag must be v${version}.`);
  return version;
}
export async function versionCheck(tag) {
  const pkg = await json(join(root, "package.json"));
  const lock = await json(join(root, "package-lock.json"));
  const tauri = await json(join(root, "src-tauri/tauri.conf.json"));
  const cargo = await readFile(join(root, "src-tauri/Cargo.toml"), "utf8");
  const cargoLock = await readFile(join(root, "src-tauri/Cargo.lock"), "utf8");
  const cargoVersion = cargo.match(
    /\[package\][\s\S]*?\nversion\s*=\s*"([^"]+)"/,
  )?.[1];
  const lockVersion = cargoLock
    .split("[[package]]")
    .find((block) => /^\s*name = "flareops"/m.test(block))
    ?.match(/version = "([^"]+)"/)?.[1];
  return validateVersion(
    [
      pkg.version,
      lock.version,
      lock.packages[""].version,
      tauri.version,
      cargoVersion,
      lockVersion,
    ],
    tag,
  );
}
export async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
async function files(dir) {
  const output = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isFile()) output.push(join(dir, entry.name));
    else if (entry.isDirectory() && !entry.name.endsWith(".app"))
      output.push(...(await files(join(dir, entry.name))));
  }
  return output;
}
export async function collect(
  bundleDir,
  output,
  triple,
  version,
  signing = "unsigned",
) {
  const target = releaseTargets[triple];
  if (!target) throw Error("Unsupported release target.");
  if (
    !["unsigned", "notarized"].includes(signing) ||
    (signing === "notarized" && target.platform !== "macos")
  )
    throw Error("Invalid signing status.");
  const candidates = await files(bundleDir);
  await mkdir(output, { recursive: true });
  const assets = [];
  for (const extension of target.extensions) {
    const matches = candidates.filter((path) => path.endsWith(extension));
    if (matches.length !== 1)
      throw Error(
        `Expected exactly one ${extension} installer for ${triple}; found ${matches.length}. Use a clean release build.`,
      );
    const filename = `FlareOps-${target.platform}-${target.arch}${extension}`;
    await copyFile(matches[0], join(output, filename));
    assets.push({
      filename,
      platform: target.platform,
      arch: target.arch,
      format: extension.slice(1),
      bytes: (await stat(matches[0])).size,
      sha256: await sha256(join(output, filename)),
      signing: target.platform === "linux" ? "not-applicable" : signing,
    });
  }
  const record = { version, target: triple, assets };
  await writeFile(
    join(output, `${triple}.json`),
    JSON.stringify(record, null, 2) + "\n",
  );
  return record;
}
export async function manifest(input, output, repository, version, commit) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository))
    throw Error("Expected GitHub owner/repository.");
  if (!/^[a-f0-9]{40}$/.test(commit))
    throw Error("Expected full source commit SHA.");
  const source = await files(input);
  const assets = [];
  for (const [triple, target] of Object.entries(releaseTargets)) {
    const matches = source.filter(
      (path) => basename(path) === `${triple}.json`,
    );
    if (matches.length !== 1)
      throw Error(`Missing or duplicate build metadata for ${triple}.`);
    const record = await json(matches[0]);
    if (
      record.version !== version ||
      record.target !== triple ||
      record.assets.length !== target.extensions.length
    )
      throw Error(`Inconsistent build metadata for ${triple}.`);
    for (const extension of target.extensions) {
      const filename = `FlareOps-${target.platform}-${target.arch}${extension}`;
      const asset = record.assets.find((item) => item.filename === filename);
      const paths = source.filter((path) => basename(path) === filename);
      if (
        !asset ||
        paths.length !== 1 ||
        asset.platform !== target.platform ||
        asset.arch !== target.arch ||
        asset.format !== extension.slice(1)
      )
        throw Error(`Missing or invalid installer ${filename}.`);
      if (
        asset.sha256 !== (await sha256(paths[0])) ||
        asset.bytes !== (await stat(paths[0])).size
      )
        throw Error(`Checksum/size mismatch: ${filename}.`);
      await mkdir(output, { recursive: true });
      await copyFile(paths[0], join(output, filename));
      assets.push({
        ...asset,
        url: `https://github.com/${repository}/releases/download/v${version}/${filename}`,
      });
    }
  }
  const result = {
    schemaVersion: 1,
    product: "FlareOps",
    version,
    tag: `v${version}`,
    prerelease: version.includes("-"),
    commit,
    releaseUrl: `https://github.com/${repository}/releases/tag/v${version}`,
    assets,
  };
  await writeFile(
    join(output, "downloads.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  await writeFile(
    join(output, "SHA256SUMS.txt"),
    assets.map((a) => `${a.sha256}  ${a.filename}`).join("\n") + "\n",
  );
  return result;
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  const version = await versionCheck(process.env.RELEASE_TAG);
  if (command === "check") console.log(version);
  else if (command === "collect")
    await collect(
      args[0],
      args[1],
      args[2],
      version,
      process.env.RELEASE_SIGNING || "unsigned",
    );
  else if (command === "manifest")
    await manifest(
      args[0],
      args[1],
      process.env.GITHUB_REPOSITORY,
      version,
      process.env.GITHUB_SHA,
    );
  else
    throw Error(
      "Use check, collect <bundle-dir> <output-dir> <target>, or manifest <input-dir> <output-dir>.",
    );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
