import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  mkdtemp,
  writeFile,
  rm,
  readFile,
  rename,
  open,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
export function previewTarget(account, profile, project, head) {
  if (
    !/^[a-f0-9]{32}$/i.test(account) ||
    !/^[\w-]{1,64}$/.test(profile) ||
    !/^[a-f0-9-]{36}$/.test(project) ||
    !/^[a-f0-9]{40}$/.test(head)
  )
    throw Error("Invalid preview context.");
  return {
    worker:
      "flareops-p-" +
      createHash("sha256")
        .update(JSON.stringify([account, profile, project]))
        .digest("hex")
        .slice(0, 24),
    name: "review-" + head.slice(0, 20),
  };
}
export function previewConfig(account, worker) {
  return {
    name: worker,
    account_id: account,
    main: "worker.js",
    compatibility_date: "2026-10-02",
    compatibility_flags: ["nodejs_compat"],
    no_bundle: true,
    find_additional_modules: false,
    workers_dev: false,
    preview_urls: true,
    previews: {
      vars: { ENVIRONMENT: "preview" },
      observability: { enabled: true },
    },
  };
}
export function previewResult(value, target, head) {
  if (value.deployment?.annotations?.["workers/tag"] !== head)
    throw Error("Preview deployment does not match the reviewed revision.");
  const urls = (list) =>
    Array.isArray(list)
      ? list.filter((url) => {
          try {
            const u = new URL(url);
            return (
              u.protocol === "https:" &&
              u.hostname.endsWith(".workers.dev") &&
              !u.username &&
              !u.password &&
              !u.search &&
              !u.hash
            );
          } catch {
            return false;
          }
        })
      : [];
  return {
    head,
    worker: target.worker,
    name: target.name,
    previewUrls: urls(value.preview?.urls),
    deploymentUrls: urls(value.deployment?.urls),
    deploymentId:
      typeof value.deployment?.id === "string" ? value.deployment.id : "",
    createdAt: new Date().toISOString(),
  };
}
// The manifest can request new isolated resources only. Existing IDs, paths,
// arbitrary Wrangler configuration and production bindings are never accepted.
export function resourcePlan(value = []) {
  if (!Array.isArray(value) || value.length > 12)
    throw Error("Invalid preview resource manifest (maximum 12 resources).");
  const names = new Set(["ENVIRONMENT"]);
  return value.map((item) => {
    if (
      !item ||
      !["d1", "kv", "r2"].includes(item.type) ||
      typeof item.binding !== "string" ||
      !/^[A-Z][A-Z0-9_]{0,63}$/.test(item.binding) ||
      names.has(item.binding) ||
      Object.keys(item).some((k) => !["type", "binding"].includes(k))
    )
      throw Error(
        "Invalid preview resource manifest. Use unique uppercase bindings and d1, kv or r2 types.",
      );
    names.add(item.binding);
    return { type: item.type, binding: item.binding };
  });
}
export function accessConfig(workerId, email, name) {
  if (
    !workerId ||
    typeof email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  )
    throw Error(
      "Preview Access requires a Cloudflare user with a verified email.",
    );
  return {
    name,
    type: "self_hosted",
    session_duration: "24h",
    destinations: [{ type: "preview_worker", worker_id: workerId }],
    policies: [
      {
        name: "Preview owner",
        decision: "allow",
        include: [{ email: { email } }],
      },
    ],
  };
}
export async function provisionResources(
  api,
  account,
  target,
  plan,
  records,
  save,
) {
  const config = {};
  for (const item of plan) {
    const key = item.binding;
    let record = records[key];
    if (record && record.type !== item.type)
      throw Error("Preview resource type changed. Create a new review.");
    if (record?.pending)
      throw Error(
        "Preview resource creation was interrupted. Check the recorded resource name in Cloudflare before retrying.",
      );
    if (!record) {
      const name =
        "fp-" +
        createHash("sha256")
          .update(JSON.stringify([account, target.worker, target.name, item]))
          .digest("hex")
          .slice(0, 40);
      record = records[key] = { ...item, name, pending: true };
      if (
        item.type === "r2" &&
        (await api(`/accounts/${account}/r2/buckets/${name}`, "GET", true))
      ) {
        delete records[key];
        throw Error(
          "Preview bucket name already exists. Refusing to attach untracked data.",
        );
      }
      await save(); // Never silently adopt an existing resource after an ambiguous failure.
      let created;
      try {
        if (item.type === "d1")
          created = await api(
            `/accounts/${account}/d1/database`,
            "POST",
            false,
            { name },
          );
        if (item.type === "kv")
          created = await api(
            `/accounts/${account}/storage/kv/namespaces`,
            "POST",
            false,
            { title: name },
          );
        if (item.type === "r2")
          created = await api(
            `/accounts/${account}/r2/buckets`,
            "POST",
            false,
            { name },
          );
      } catch (error) {
        if (error.definitive) {
          delete records[key];
          await save();
        }
        throw error;
      }
      record.id =
        item.type === "d1"
          ? created?.uuid
          : item.type === "kv"
            ? created?.id
            : created?.name;
      if (typeof record.id !== "string" || !/^[a-zA-Z0-9-]+$/.test(record.id))
        throw Error("Preview resource creation returned no valid ID.");
      delete record.pending;
      await save();
    }
    if (item.type === "d1")
      (config.d1_databases ??= []).push({
        binding: key,
        database_name: record.name,
        database_id: record.id,
      });
    if (item.type === "kv")
      (config.kv_namespaces ??= []).push({ binding: key, id: record.id });
    if (item.type === "r2")
      (config.r2_buckets ??= []).push({ binding: key, bucket_name: record.id });
  }
  return config;
}
export function accessMatches(app, policies, target, worker, user) {
  return !(
    app?.name !== target.worker ||
    app.destinations?.length !== 1 ||
    app.destinations[0].type !== "preview_worker" ||
    app.destinations[0].worker_id !== worker.id ||
    !Array.isArray(policies) ||
    policies.length !== 1 ||
    policies[0].decision !== "allow" ||
    policies[0].include?.length !== 1 ||
    policies[0].include[0].email?.email !== user.email
  );
}
export async function ensureAccess(api, account, target, state, save) {
  // Resolve the signed-in identity and require an existing Zero Trust organization.
  const user = await api("/user");
  if (!user?.email || user.email_verified === false)
    throw Error("Preview Access requires a verified Cloudflare user email.");
  await api(`/accounts/${account}/access/organizations`);
  const workerPath = `/accounts/${account}/workers/workers`;
  let worker = await api(workerPath + "/" + target.worker, "GET", true);
  if (!worker)
    worker = await api(workerPath, "POST", false, {
      name: target.worker,
      subdomain: { enabled: false, previews_enabled: true },
    });
  const access = accessConfig(worker.id, user.email, target.worker);
  if (state.accessPending)
    throw Error(
      "Preview Access creation was interrupted. Check the application in Zero Trust before retrying.",
    );
  if (!state.accessId) {
    state.accessPending = true;
    await save();
    let app;
    try {
      app = await api(
        `/accounts/${account}/access/apps`,
        "POST",
        false,
        access,
      );
    } catch (error) {
      if (error.definitive) {
        delete state.accessPending;
        await save();
      }
      throw error;
    }
    if (!app?.id)
      throw Error("Preview Access creation returned no application ID.");
    state.accessId = app.id;
    state.email = user.email;
    state.workerId = worker.id;
    delete state.accessPending;
    await save();
  }
  // Reconcile only the app recorded by this installation. Stop on external edits.
  const app = await api(`/accounts/${account}/access/apps/${state.accessId}`);
  const policies = await api(
    `/accounts/${account}/access/apps/${state.accessId}/policies`,
  );
  if (!accessMatches(app, policies, target, worker, user))
    throw Error(
      "Preview Access policy changed. Restore its owner-only policy in Zero Trust before deploying.",
    );
}
export async function cleanupResources(api, account, records, save) {
  for (const [binding, record] of Object.entries(records)) {
    if (record.pending || !/^[a-zA-Z0-9-]+$/.test(record.id || ""))
      throw Error(
        "Preview cleanup needs manual reconciliation of an interrupted resource creation.",
      );
    const suffix = {
      d1: "d1/database",
      kv: "storage/kv/namespaces",
      r2: "r2/buckets",
    }[record.type];
    if (!suffix) throw Error("Invalid preview resource journal.");
    await api(`/accounts/${account}/${suffix}/${record.id}`, "DELETE", true);
    delete records[binding];
    await save();
  }
}
export async function main() {
  let dir, lock;
  try {
    const [dist, runtime, account, profile, project, head, action] =
      process.argv.slice(1);
    const target = previewTarget(account, profile, project, head);
    if (!["deploy", "status", "delete", "delete-data"].includes(action))
      throw Error("Invalid preview action.");
    const { p: setProfile, s: getToken } = await import(
      new URL("oauth-D6EZEBcY.mjs", pathToFileURL(dist + "/"))
    );
    setProfile(profile);
    const token = await getToken();
    if (!token) throw Error("Sign in to Cloudflare again.");
    const api = async (path, method = "GET", missing = false, body) => {
      const response = await fetch(
        "https://api.cloudflare.com/client/v4" + path,
        {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          redirect: "error",
          signal: AbortSignal.timeout(30000),
        },
      );
      if (missing && response.status === 404) return null;
      if (!response.ok) {
        const error = Error(
          `Cloudflare preview request failed (${response.status}). Check Workers, Access and requested storage permissions; enable Zero Trust for Access.`,
        );
        error.definitive = response.status >= 400 && response.status < 500;
        throw error;
      }
      if (response.status === 204) return {};
      const data = await response.json();
      if (!data.success)
        throw Error("Cloudflare could not complete the preview request.");
      return data.result;
    };
    if ((await api(`/accounts/${account}`))?.id !== account)
      throw Error("Account access could not be verified.");
    const base = `/accounts/${account}/workers/workers/${target.worker}/previews/${target.name}`;
    const statePath = join(process.cwd(), target.worker + "-resources.json");
    const lockPath = statePath + ".lock";
    try {
      lock = await open(lockPath, "wx", 0o600);
    } catch {
      throw Error(
        "Preview configuration is already in progress, or an interrupted operation needs its local lock cleared in the application data directory.",
      );
    }
    await lock.writeFile(String(process.pid));
    lock.path = lockPath;
    let state = { resources: {} };
    try {
      state = JSON.parse(await readFile(statePath, "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT")
        throw Error("Preview configuration journal cannot be read.");
    }
    const save = async () => {
      await writeFile(statePath + ".tmp", JSON.stringify(state), {
        mode: 0o600,
      });
      await rename(statePath + ".tmp", statePath);
    };
    const details = async () => {
      const app = state.accessId
        ? await api(
            `/accounts/${account}/access/apps/${state.accessId}`,
            "GET",
            true,
          )
        : null;
      const policies = app
        ? await api(
            `/accounts/${account}/access/apps/${state.accessId}/policies`,
          )
        : [];
      return {
        access:
          app &&
          accessMatches(
            app,
            policies,
            target,
            { id: state.workerId },
            { email: state.email },
          )
            ? "configured"
            : "unconfigured",
        accessEmail: state.email,
        resources: Object.values(state.resources[target.name] || {}),
      };
    };

    if (action === "delete" || action === "delete-data") {
      await api(base, "DELETE", true);
      if (action === "delete-data")
        await cleanupResources(
          api,
          account,
          state.resources[target.name] || {},
          save,
        );
      console.log(JSON.stringify({ deleted: true }));
      return;
    }
    if (action === "status") {
      const preview = await api(base, "GET", true);
      if (!preview) {
        console.log("null");
        return;
      }
      console.log(
        JSON.stringify({
          ...previewResult(
            { preview, deployment: await api(base + "/deployments/latest") },
            target,
            head,
          ),
          ...(await details()),
        }),
      );
      return;
    }
    let input = "";
    for await (const chunk of process.stdin) {
      input += chunk;
      if (input.length > 16000000) throw Error("Preview bundle exceeds 2 MB.");
    }
    const artifact = JSON.parse(input);
    if (
      artifact.head !== head ||
      typeof artifact.code !== "string" ||
      Buffer.byteLength(artifact.code) > 2000000 ||
      !artifact.code.trim()
    )
      throw Error("Invalid preview bundle.");
    const plan = resourcePlan(artifact.resources);
    await ensureAccess(api, account, target, state, save);
    const records = (state.resources[target.name] ??= {});
    const bindings = await provisionResources(
      api,
      account,
      target,
      plan,
      records,
      save,
    );
    dir = await mkdtemp(join(tmpdir(), "flareops-preview-"));
    await writeFile(join(dir, "worker.js"), artifact.code, { mode: 0o600 });
    await writeFile(
      join(dir, "wrangler.json"),
      JSON.stringify({
        ...previewConfig(account, target.worker),
        previews: {
          ...previewConfig(account, target.worker).previews,
          ...bindings,
        },
      }),
      { mode: 0o600 },
    );
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) =>
          !/^(CLOUDFLARE_|CF_|WRANGLER_|NODE_OPTIONS$|NODE_PATH$)/.test(key),
      ),
    );
    Object.assign(env, {
      CLOUDFLARE_API_TOKEN: token,
      CLOUDFLARE_ACCOUNT_ID: account,
      CI: "1",
      NO_COLOR: "1",
      WRANGLER_SEND_METRICS: "false",
      WRANGLER_LOG_PATH: join(dir, "wrangler.log"),
      CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
    });
    try {
      // No repository build commands, package scripts, or project config run with credentials.
      await exec(
        process.execPath,
        [
          join(runtime, "node_modules/wrangler/bin/wrangler.js"),
          "preview",
          "--config",
          join(dir, "wrangler.json"),
          "--name",
          target.name,
          "--ignore-base-config",
          "--json",
          "--tag",
          head,
        ],
        { cwd: dir, env, timeout: 180000, maxBuffer: 4000000 },
      );
    } catch {
      throw Error(
        "Preview upload failed. The review must include a self-contained Worker bundle at .flareops/preview/worker.js. Check Workers permissions and bundle compatibility.",
      );
    }
    console.log(
      JSON.stringify({
        ...previewResult(
          {
            preview: await api(base),
            deployment: await api(base + "/deployments/latest"),
          },
          target,
          head,
        ),
        ...(await details()),
      }),
    );
  } catch (error) {
    console.error(
      error instanceof Error &&
        /^(Invalid preview|Preview |Cloudflare |Account access|Sign in)/.test(
          error.message,
        )
        ? error.message
        : "Preview operation failed.",
    );
    process.exitCode = 1;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true });
    if (lock) {
      await lock.close();
      await rm(lock.path, { force: true });
    }
  }
}
