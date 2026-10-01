import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeTraffic } from "../src-tauri/src/cf/worker-traffic.mjs";

const row = (
  name,
  requests,
  wallTime,
  responseBodySize = 100,
  errors = 0,
  subrequests = 0,
) => ({
  dimensions: { scriptName: name },
  sum: { requests, wallTime, responseBodySize, errors, subrequests },
});

test("aggregates bandwidth and errors and weights wall time by requests across Workers", () => {
  const result = summarizeTraffic([
    row("busy", 9, 9000, 2000, 1, 8),
    row("slow", 1, 10000, 500, 0, 2),
    row("busy", 10, 21000),
  ]);
  assert.deepEqual({ ...result.requests }, { busy: 19, slow: 1 });
  assert.equal(result.averageWallTimeMs, 2);
  assert.equal(result.bandwidthBytes, 2600);
  assert.equal(result.errors, 1);
  assert.equal(result.subrequests, 10);
});

test("empty traffic has zero totals and no average", () => {
  const result = summarizeTraffic([]);
  assert.equal(result.bandwidthBytes, 0);
  assert.equal(result.errors, 0);
  assert.equal(result.averageWallTimeMs, null);
});

test("missing metrics never become misleading partial totals", () => {
  const result = summarizeTraffic([
    row("first", 1, 1000),
    { dimensions: { scriptName: "second" }, sum: { requests: 1 } },
    row("third", 1, 1000),
  ]);
  assert.equal(result.bandwidthBytes, null);
  assert.equal(result.errors, null);
  assert.equal(result.subrequests, null);
  assert.equal(result.averageWallTimeMs, null);
  assert.equal(
    Object.values(result.requests).reduce((a, b) => a + b),
    3,
  );
});

test("rejects incomplete and malformed results", () => {
  for (const rows of [
    null,
    [null],
    [row("bad", -1, 0)],
    Array(10000).fill(row("busy", 1, 0)),
  ]) {
    assert.throws(() => summarizeTraffic(rows));
  }
});
