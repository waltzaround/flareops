import { collectPages } from "./pagination";
import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import type {
  CommandSchema,
  Discovery,
  Execution,
  Plan,
  Request,
  Resource,
  Page,
  Diagnostics,
} from "./types";
import { paths, resourceSchema } from "./types";
import { demoCommands, demoHistory, demoResources } from "./demo";
import { useUI, isDesktop } from "./store";
export const demoData = new Map<string, Resource[]>();
let jobs = [...demoHistory];
const demo = () => useUI.getState().mode === "demo";
const call = <T>(name: string, args?: Record<string, unknown>): Promise<T> => {
  if (!isDesktop)
    return Promise.reject(
      Error(
        "Open the FlareOps desktop app to sign in and access live Cloudflare accounts.",
      ),
    );
  return invoke<T>(name, args);
};
export function resourcesForAccount(id: string) {
  if (!demoData.has(id))
    demoData.set(
      id,
      id === "demo-studio-prod" ? structuredClone(demoResources) : [],
    );
  return demoData.get(id)!;
}
export function unwrap(data: unknown): unknown {
  if (data && typeof data === "object" && "result" in data)
    return (data as { result: unknown }).result;
  return data;
}
export function normalizeResources(
  data: unknown,
  kind: Resource["kind"],
): Resource[] {
  let raw = unwrap(data);
  if (kind === "R2" && raw && typeof raw === "object" && "buckets" in raw)
    raw = (raw as { buckets: unknown }).buckets;
  if (raw && typeof raw === "object" && "items" in raw)
    raw = (raw as { items: unknown }).items;
  const array = z.array(z.record(z.unknown())).parse(raw);
  return array.map((r) =>
    resourceSchema.parse({
      id:
        kind === "Queues"
          ? r.queue_id
          : (r.id ?? r.uuid ?? r.namespace_id ?? r.name),
      name:
        kind === "Queues"
          ? r.queue_name
          : (r.name ?? r.namespace_name ?? r.title ?? r.id),
      kind,
      status: r.status ?? "Available",
      description:
        kind === "Zones"
          ? `${(r.plan as { name?: string })?.name ?? "Cloudflare"} plan`
          : kind === "DNS"
            ? (r.comment ?? "")
            : String(r.description ?? ""),
      modified:
        r.modified_on ??
        r.updated_on ??
        r.created_on ??
        r.updated_at ??
        r.created_at ??
        "",
      type: r.type,
      content: r.content,
      proxied: r.proxied,
      ttl: r.ttl,
      metadata: r,
    }),
  );
}
export function normalizePages(data: unknown): Resource[] {
  return z
    .array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          created_on: z.string().optional(),
          latest_deployment: z
            .object({ created_on: z.string().optional() })
            .nullish(),
        })
        .passthrough(),
    )
    .parse(unwrap(data))
    .map((p) =>
      resourceSchema.parse({
        id: `pages:${p.id}`,
        name: p.name,
        kind: "Workers",
        product: "Pages",
        status: "Available",
        modified: p.latest_deployment?.created_on ?? p.created_on ?? "",
        metadata: p,
      }),
    );
}
export async function loadResources(
  kind: Resource["kind"],
  accountId: string,
  profile: string,
  zoneId?: string,
) {
  if (demo()) {
    await new Promise((r) => setTimeout(r, 180));
    return resourcesForAccount(accountId).filter(
      (r) => r.kind === kind && (kind !== "DNS" || r.zoneId === zoneId),
    );
  }
  if (!accountId) return [];
  const fetchPage = async (page?: number, perPage?: number) => {
    const p = await prepare({
      path: paths[kind]!,
      context: {
        accountId,
        profile,
        zoneId: kind === "DNS" ? zoneId : undefined,
      },
      parameters:
        page === undefined
          ? {}
          : {
              page,
              per_page: perPage,
              ...(kind === "Workers" ? { order_by: "name", order: "asc" } : {}),
            },
    });
    const result = await runPlan(p, false, false);
    if (!result.success)
      throw Error(result.error ?? "Could not load resources");
    try {
      return normalizeResources(result.data, kind);
    } catch {
      throw Error(
        "CLI output incompatible. The raw response is available in Activity.",
      );
    }
  };
  if (kind === "Durable Objects" || kind === "Workflows")
    return collectPages(fetchPage);
  if (kind !== "Workers") return fetchPage();
  const [workers, pages] = await Promise.all([
    collectPages(fetchPage),
    collectPages(async (page, perPage) => {
      const plan = await prepare({
        path: ["pages", "list"],
        context: { accountId, profile },
        parameters: { page, per_page: perPage },
      });
      const result = await runPlan(plan, false, false);
      if (!result.success)
        throw Error(result.error ?? "Could not load Pages projects");
      return normalizePages(result.data);
    }, 10),
  ]);
  return [
    ...workers.map((r) => ({ ...r, product: "Worker" as const })),
    ...pages,
  ];
}
export async function discover(query: string): Promise<Discovery[]> {
  if (demo()) {
    const words = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    return demoCommands
      .map((c) => ({
        c,
        score: words.filter((w) =>
          (c.command + " " + c.description).toLowerCase().includes(w),
        ).length,
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.c);
  }
  const r = await call<Execution>("discover", { query });
  if (!r.success) throw Error(r.error);
  let data = unwrap(r.data);
  if (data && typeof data === "object" && "commands" in data)
    data = (data as { commands: unknown }).commands;
  return z
    .array(
      z
        .object({
          command: z.string(),
          description: z.string().optional(),
          summary: z.string().optional(),
          fullPath: z.array(z.string()).optional(),
        })
        .passthrough(),
    )
    .parse(data)
    .map((c) => ({
      command: c.command,
      description: c.description ?? c.summary ?? "",
      fullPath: c.fullPath ?? c.command.replace(/^cf /, "").split(" "),
    }));
}
export async function getSchema(path: string[]): Promise<CommandSchema> {
  if (!demo()) return call("command_schema", { path });
  const mutating = !["list", "get"].includes(path.at(-1)!);
  return {
    httpMethod:
      path.at(-1) === "delete"
        ? "DELETE"
        : path.at(-1) === "edit"
          ? "PATCH"
          : mutating
            ? "POST"
            : "GET",
    path: "/demo",
    pathParams:
      path[0] === "dns"
        ? [
            { name: "zone_id", type: "string", required: true },
            ...(path.at(-1) === "delete" || path.at(-1) === "edit"
              ? [{ name: "dns_record_id", type: "string", required: true }]
              : []),
          ]
        : [],
    queryParams: [],
    hasRequestBody: mutating && path.at(-1) !== "delete",
    requestBodyFields: [],
  };
}
export function formatCommand(r: Request) {
  const args = ["cf", ...r.path];
  Object.entries(r.parameters).forEach(([k, v]) => {
    if (r.path[0] === "dns" && k === "dns_record_id") args.push(String(v));
    else args.push("--" + k.replaceAll("_", "-"), String(v));
  });
  if (r.body) args.push("--body", JSON.stringify(r.body));
  args.push("--profile", r.context.profile);
  if (r.context.zoneId) args.push("--zone", r.context.zoneId);
  return (
    `CLOUDFLARE_ACCOUNT_ID=${r.context.accountId} ` +
    args
      .map((v) => (/[\s{}"]/.test(v) ? `'${v.replaceAll("'", "'\\''")}'` : v))
      .join(" ")
  );
}
export async function prepare(request: Request): Promise<Plan> {
  if (!demo()) return call("prepare", { request });
  const schema = await getSchema(request.path);
  return {
    id: crypto.randomUUID(),
    command: formatCommand(request),
    classification:
      schema.httpMethod === "GET"
        ? "Read"
        : schema.httpMethod === "DELETE" ||
            request.path.some((p) => p.includes("purge"))
          ? "Destructive"
          : schema.httpMethod === "PATCH"
            ? "Modify"
            : "Create",
    request,
    args: [],
    schema,
    dryRunSupported: true,
    createdAt: Date.now(),
  };
}
export async function runPlan(
  plan: Plan,
  confirmed: boolean,
  dryRun: boolean,
): Promise<Execution> {
  if (!demo()) return call("run_plan", { id: plan.id, confirmed, dryRun });
  if (plan.classification !== "Read" && !confirmed)
    throw Error("Review this command before running it.");
  await new Promise((r) => setTimeout(r, 650));
  if (!dryRun && plan.classification !== "Read") {
    const all = resourcesForAccount(plan.request.context.accountId),
      body = plan.request.body as Record<string, unknown>,
      path = plan.request.path;
    if (path[0] === "dns") {
      const id = String(
        plan.request.parameters.dns_record_id ?? crypto.randomUUID(),
      );
      if (path.at(-1) === "delete")
        demoData.set(
          plan.request.context.accountId,
          all.filter((r) => r.id !== id),
        );
      else {
        const item = resourceSchema.parse({
          id,
          kind: "DNS",
          ...body,
          status: body.proxied ? "Proxied" : "DNS only",
          zoneId: plan.request.context.zoneId,
          modified: "Just now",
        });
        demoData.set(plan.request.context.accountId, [
          ...all.filter((r) => r.id !== id),
          item,
        ]);
      }
    } else if (["d1", "r2"].includes(path[0]) && body?.name) {
      all.push(
        resourceSchema.parse({
          id: crypto.randomUUID(),
          name: body.name,
          kind: path[0] === "d1" ? "D1" : "R2",
          status: "Available",
          modified: "Just now",
        }),
      );
    }
  }
  const e: Execution = {
    id: plan.id,
    success: true,
    data: { success: true, demo: true, dryRun },
    rawStdout: JSON.stringify({ success: true, demo: true, dryRun }, null, 2),
    rawStderr: "",
    exitCode: 0,
    durationMs: 650,
    command: plan.command + (dryRun ? " --dry-run" : ""),
    profile: plan.request.context.profile,
    accountId: plan.request.context.accountId,
    zoneId: plan.request.context.zoneId,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  };
  jobs = [e, ...jobs].slice(0, 200);
  return e;
}
export const getHistory = async () =>
  demo() ? jobs : call<Execution[]>("history");
export const clearHistory = async () => {
  if (demo()) jobs = [];
  else await call("clear_history");
};
export const cancelJob = (id: string) => call("cancel", { id });
export const diagnostics = () => call<Diagnostics>("system_check");
export const profiles = () => call<Execution>("profiles");
export const accounts = (profile: string) =>
  call<Execution>("accounts", { profile });
export const authAction = (
  action: string,
  name?: string,
  confirmed = false,
  id = crypto.randomUUID(),
) => call<Execution>("auth_action", { action, name, confirmed, id });

export const workerTraffic = async (profile: string, accountId: string) => {
  const schema = z.object({
    requests: z.record(z.number().finite().nonnegative()),
    bandwidthBytes: z.number().finite().nonnegative().nullable().default(null),
    averageWallTimeMs: z
      .number()
      .finite()
      .nonnegative()
      .nullable()
      .default(null),
    errors: z.number().finite().nonnegative().nullable().default(null),
    subrequests: z.number().finite().nonnegative().nullable().default(null),
    start: z.string(),
    end: z.string(),
  });
  if (demo()) {
    const requests = Object.fromEntries(
      resourcesForAccount(accountId)
        .filter((r) => r.kind === "Workers" && r.product !== "Pages")
        .map((r, i) => [r.name, [12400, 8300, 260, 0][i % 4]]),
    );
    const total = Object.values(requests).reduce(
      (sum, count) => sum + count,
      0,
    );
    return {
      requests,
      bandwidthBytes: total * 18432,
      averageWallTimeMs: total ? 42.6 : null,
      errors: Math.round(total * 0.002),
      subrequests: Math.round(total * 1.4),
      start: new Date(Date.now() - 86400000).toISOString(),
      end: new Date().toISOString(),
    };
  }
  return schema.parse(await call("worker_traffic", { profile, accountId }));
};

export const workerCrons = async (profile: string, accountId: string) => {
  const schema = z.object({
    schedules: z.array(
      z.object({
        worker: z.string(),
        cron: z.string(),
        historyAvailable: z.boolean(),
        lastRun: z
          .object({ at: z.string().datetime(), status: z.string() })
          .nullable(),
      }),
    ),
    historyStart: z.string().datetime(),
    historyEnd: z.string().datetime(),
    failures: z.array(z.string()),
    workers: z.number().int().nonnegative(),
  });
  if (demo()) {
    const workers = resourcesForAccount(accountId).filter(
      (r) => r.kind === "Workers" && r.product !== "Pages",
    );
    return {
      schedules: workers.slice(0, 3).map((r, i) => ({
        worker: r.name,
        cron: ["*/15 * * * *", "0 2 * * *", "0 9 * * MON-FRI"][i],
        historyAvailable: true,
        lastRun: {
          at: new Date(Date.now() - (i + 1) * 3600000).toISOString(),
          status: i === 1 ? "exception" : "success",
        },
      })),
      failures: [],
      workers: workers.length,
      historyStart: new Date(Date.now() - 7 * 86400000).toISOString(),
      historyEnd: new Date().toISOString(),
    };
  }
  return schema.parse(await call("worker_crons", { profile, accountId }));
};
