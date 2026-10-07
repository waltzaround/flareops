import { test } from "node:test";
import assert from "node:assert/strict";
import {
  previewTarget,
  previewConfig,
  previewResult,
} from "../src-tauri/src/cf/project-preview.mjs";
const account = "a".repeat(32),
  project = "12345678-1234-1234-1234-123456789abc",
  head = "b".repeat(40);
test("preview targets isolate accounts, profiles, projects and review revisions", () => {
  const target = previewTarget(account, "personal", project, head);
  assert.notEqual(
    target.worker,
    previewTarget(account, "work", project, head).worker,
  );
  assert.notEqual(
    target.worker,
    previewTarget("c".repeat(32), "personal", project, head).worker,
  );
  assert.notEqual(
    target.name,
    previewTarget(account, "personal", project, "d".repeat(40)).name,
  );
  assert.throws(() => previewTarget(account, "../work", project, head));
});
test("configuration has no production routes, bindings, secrets or executable builds", () => {
  const config = previewConfig(account, "flareops-p-test");
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, true);
  assert.equal(config.no_bundle, true);
  assert.equal(config.find_additional_modules, false);
  for (const key of [
    "build",
    "routes",
    "services",
    "env",
    "secrets",
    "d1_databases",
    "kv_namespaces",
  ])
    assert.equal(config[key], undefined);
  assert.deepEqual(config.previews, {
    vars: { ENVIRONMENT: "preview" },
    observability: { enabled: true },
  });
});
test("only exposes HTTPS preview URLs and requires the exact revision tag", () => {
  const target = previewTarget(account, "personal", project, head);
  const result = previewResult(
    {
      preview: {
        urls: [
          "https://test.example.workers.dev",
          "javascript:alert(1)",
          "https://evil.com",
          "https://secret@host.workers.dev",
        ],
      },
      deployment: {
        id: "deployment",
        annotations: { "workers/tag": head },
        urls: ["https://exact.example.workers.dev"],
      },
    },
    target,
    head,
  );
  assert.deepEqual(result.previewUrls, ["https://test.example.workers.dev"]);
  assert.deepEqual(result.deploymentUrls, [
    "https://exact.example.workers.dev",
  ]);
  assert.throws(() =>
    previewResult(
      { deployment: { annotations: { "workers/tag": "different" } } },
      target,
      head,
    ),
  );
});

import {
  resourcePlan,
  accessConfig,
  ensureAccess,
  provisionResources,
  cleanupResources,
} from "../src-tauri/src/cf/project-preview.mjs";
test("resource manifest rejects production IDs, duplicate bindings and unsupported types", () => {
  assert.deepEqual(resourcePlan([{ type: "d1", binding: "DB" }]), [
    { type: "d1", binding: "DB" },
  ]);
  for (const value of [
    [{ type: "d1", binding: "DB", database_id: "production" }],
    [{ type: "kv", binding: "ENVIRONMENT" }],
    [{ type: "queue", binding: "Q" }],
    [
      { type: "kv", binding: "X" },
      { type: "r2", binding: "X" },
    ],
  ])
    assert.throws(() => resourcePlan(value));
});
test("Access targets only project previews and the signed-in email", async () => {
  const target = previewTarget(account, "personal", project, head),
    state = { resources: {} },
    calls = [];
  const expected = accessConfig(
    "worker-id",
    "owner@example.com",
    target.worker,
  );
  const api = async (path, method = "GET", missing, body) => {
    calls.push([path, method, body]);
    if (path === "/user")
      return { email: "owner@example.com", email_verified: true };
    if (path.endsWith("/policies")) return expected.policies;
    if (path.endsWith("/access/apps") && method === "POST")
      return { id: "app-id" };
    if (path.endsWith("/access/apps/app-id")) return expected;
    return { id: "worker-id" };
  };
  await ensureAccess(api, account, target, state, async () => {});
  assert.equal(state.accessId, "app-id");
  assert.deepEqual(calls.find((c) => c[1] === "POST")[2], expected);
  await ensureAccess(api, account, target, state, async () => {});
  assert.equal(calls.filter((c) => c[1] === "POST").length, 1);
  await assert.rejects(
    ensureAccess(
      async () => {
        throw Error("permission denied");
      },
      account,
      target,
      {},
      async () => {},
    ),
    /permission denied/,
  );
  await assert.rejects(
    ensureAccess(
      async (...args) =>
        args[0].endsWith("/policies") ? [{ decision: "bypass" }] : api(...args),
      account,
      target,
      state,
      async () => {},
    ),
    /policy changed/,
  );
});
test("isolated resource provisioning persists progress, reuses IDs and supports cleanup", async () => {
  const target = previewTarget(account, "personal", project, head),
    records = {},
    calls = [],
    snapshots = [];
  const api = async (path, method, missing, body) => {
    calls.push([path, method, body]);
    if (method === "GET") return null;
    return { uuid: "d1-id", id: "kv-id", name: body?.name };
  };
  const plan = resourcePlan([
    { type: "d1", binding: "DB" },
    { type: "kv", binding: "CACHE" },
    { type: "r2", binding: "FILES" },
  ]);
  const save = async () => snapshots.push(JSON.stringify(records));
  const config = await provisionResources(
    api,
    account,
    target,
    plan,
    records,
    save,
  );
  assert.equal(config.d1_databases[0].database_id, "d1-id");
  assert.equal(config.kv_namespaces[0].id, "kv-id");
  assert.match(config.r2_buckets[0].bucket_name, /^fp-/);
  assert.match(snapshots[0], /pending/);
  await provisionResources(api, account, target, plan, records, save);
  assert.equal(calls.filter((c) => c[1] === "POST").length, 3);
  await cleanupResources(api, account, records, save);
  assert.deepEqual(records, {});
  assert.equal(calls.filter((c) => c[1] === "DELETE").length, 3);
});
test("ambiguous resource failures never silently create duplicates on retry", async () => {
  const target = previewTarget(account, "personal", project, head),
    records = {};
  const plan = resourcePlan([{ type: "kv", binding: "CACHE" }]);
  await assert.rejects(
    provisionResources(
      async () => {
        throw Error("network");
      },
      account,
      target,
      plan,
      records,
      async () => {},
    ),
    /network/,
  );
  await assert.rejects(
    provisionResources(
      async () => assert.fail("must not retry"),
      account,
      target,
      plan,
      records,
      async () => {},
    ),
    /interrupted/,
  );
});
test("permission rejection can be retried without leaving a pending resource", async () => {
  const records = {},
    plan = resourcePlan([{ type: "d1", binding: "DB" }]);
  await assert.rejects(
    provisionResources(
      async () => {
        const error = Error("forbidden");
        error.definitive = true;
        throw error;
      },
      account,
      previewTarget(account, "personal", project, head),
      plan,
      records,
      async () => {},
    ),
  );
  assert.deepEqual(records, {});
});
test("cleanup preserves failed resources and records completed deletions", async () => {
  const records = {
    DB: { type: "d1", id: "db-id" },
    FILES: { type: "r2", id: "bucket-id" },
  };
  await assert.rejects(
    cleanupResources(
      async (path) => {
        if (path.includes("/r2/")) throw Error("bucket not empty");
      },
      account,
      records,
      async () => {},
    ),
    /bucket not empty/,
  );
  assert.deepEqual(Object.keys(records), ["FILES"]);
});
test("separate reviews receive different data resources", async () => {
  const names = [];
  for (const sha of [head, "c".repeat(40)]) {
    await provisionResources(
      async (path, method, missing, body) => {
        names.push(body.name);
        return { uuid: "new-id" };
      },
      account,
      previewTarget(account, "personal", project, sha),
      resourcePlan([{ type: "d1", binding: "DB" }]),
      {},
      async () => {},
    );
  }
  assert.notEqual(names[0], names[1]);
});
