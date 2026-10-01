import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateVersion,
  collect,
  manifest,
  releaseTargets,
} from "./release.mjs";
test("release versions agree and tags cannot publish a different version", () => {
  assert.equal(validateVersion(["1.2.3", "1.2.3"], "v1.2.3"), "1.2.3");
  assert.equal(
    validateVersion(["1.2.3-beta.1"], "v1.2.3-beta.1"),
    "1.2.3-beta.1",
  );
  assert.throws(() => validateVersion(["1.2.3", "1.2.4"]));
  assert.throws(() => validateVersion(["1.2.3"], "v1.2.4"));
  assert.throws(() => validateVersion(["../bad"]));
});
test("release manifests require every target and verify installer contents", async () => {
  const dir = await mkdtemp(join(tmpdir(), "flareops-release-"));
  try {
    const input = join(dir, "input"),
      output = join(dir, "output");
    for (const [triple, target] of Object.entries(releaseTargets)) {
      const bundles = join(dir, "bundle", triple);
      await mkdir(bundles, { recursive: true });
      for (const ext of target.extensions)
        await writeFile(
          join(bundles, "original" + ext),
          `installer ${triple} ${ext}`,
        );
      await collect(bundles, join(input, triple), triple, "0.1.0");
    }
    const result = await manifest(
      input,
      output,
      "example/flareops",
      "0.1.0",
      "a".repeat(40),
    );
    assert.equal(result.assets.length, 5);
    assert.equal(
      result.assets[0].url,
      "https://github.com/example/flareops/releases/download/v0.1.0/FlareOps-macos-arm64.dmg",
    );
    assert.equal(result.assets[0].signing, "unsigned");
    assert.equal(
      (await readFile(join(output, "SHA256SUMS.txt"), "utf8"))
        .trim()
        .split("\n").length,
      5,
    );
    await writeFile(
      join(input, "aarch64-apple-darwin", "FlareOps-macos-arm64.dmg"),
      "tampered",
    );
    await assert.rejects(
      manifest(input, output, "example/flareops", "0.1.0", "a".repeat(40)),
      /Checksum/,
    );
    await rm(join(input, "aarch64-apple-darwin"), { recursive: true });
    await assert.rejects(
      manifest(input, output, "example/flareops", "0.1.0", "a".repeat(40)),
      /Missing/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("collector rejects stale duplicate and missing installers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "flareops-release-"));
  try {
    const bundle = join(dir, "bundle");
    await mkdir(bundle);
    await assert.rejects(
      collect(bundle, join(dir, "out"), "aarch64-apple-darwin", "0.1.0"),
      /found 0/,
    );
    await writeFile(join(bundle, "old.dmg"), "a");
    await writeFile(join(bundle, "new.dmg"), "b");
    await assert.rejects(
      collect(bundle, join(dir, "out"), "aarch64-apple-darwin", "0.1.0"),
      /found 2/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
