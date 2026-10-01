import { test } from "node:test";
import assert from "node:assert/strict";
import { nodeVersion, targets, selectTarget } from "./runtime-config.mjs";
test("every supported runtime has an immutable version, hash and target triple", () => {
  assert.match(nodeVersion, /^22\./);
  assert.equal(Object.keys(targets).length, 6);
  for (const target of Object.values(targets)) {
    assert.match(target.sha256, /^[a-f0-9]{64}$/);
    assert.ok(target.triple);
    assert.match(target.archive, /\.(tar\.gz|zip)$/);
  }
});
test("native packaging maps Apple Silicon to the Tauri sidecar suffix", () => {
  assert.equal(selectTarget("darwin", "arm64").triple, "aarch64-apple-darwin");
});
test("cross-platform dependency trees and unsupported architectures are rejected", () => {
  assert.throws(
    () => selectTarget("darwin", "arm64", "x86_64-pc-windows-msvc"),
    /Cross-compilation/,
  );
  assert.throws(() => selectTarget("linux", "riscv64"), /Unsupported/);
});
