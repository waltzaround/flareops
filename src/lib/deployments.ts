import { z } from "zod";
import { loadResources, prepare, runPlan, unwrap } from "./cf";
import type { Context, Resource } from "./types";

export type Deployment = {
  id: string;
  created: string;
  status: string;
  label: string;
  versions: string[];
  buildId?: string;
};
const rowSchema = z.object({
  id: z.string().optional(),
  build_uuid: z.string().optional(),
  created_on: z.string().optional(),
  created_at: z.string().optional(),
  status: z.string().optional(),
  build_outcome: z.string().nullish(),
  source: z.string().optional(),
  environment: z.string().optional(),
  latest_stage: z.object({ status: z.string().optional() }).nullish(),
  deployment_trigger: z
    .object({
      metadata: z
        .object({
          branch: z.string().optional(),
          commit_message: z.string().optional(),
        })
        .optional(),
    })
    .nullish(),
  build_trigger_metadata: z
    .object({
      branch: z.string().optional(),
      commit_message: z.string().optional(),
    })
    .nullish(),
  versions: z.array(z.object({ version_id: z.string() })).optional(),
  annotations: z.record(z.string()).optional(),
});
export function normalizeDeployments(
  data: unknown,
  kind: "deployments" | "builds" | "pages",
): Deployment[] {
  let raw = unwrap(data);
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const object = raw as Record<string, unknown>;
    raw = object[kind] ?? object.items ?? raw;
  }
  return z
    .array(rowSchema)
    .parse(raw)
    .map((r) => {
      const id = r.build_uuid || r.id;
      if (!id) throw Error("Deployment response is missing an identifier.");
      const metadata =
        r.deployment_trigger?.metadata || r.build_trigger_metadata;
      return {
        id,
        created: r.created_on || r.created_at || "",
        status:
          r.latest_stage?.status ||
          r.build_outcome ||
          r.status ||
          (kind === "deployments" ? "Deployed" : "Unknown"),
        label:
          [metadata?.branch, metadata?.commit_message]
            .filter(Boolean)
            .join(" · ") ||
          r.annotations?.["workers/message"] ||
          r.environment ||
          r.source ||
          id,
        versions: r.versions?.map((v) => v.version_id) || [],
        buildId: r.build_uuid,
      };
    });
}
export type BuildLog = { text: string; cursor?: string; truncated: boolean };
export function normalizeBuildLog(data: unknown, pages: boolean): BuildLog {
  const raw = unwrap(data);
  if (pages) {
    const result = z
      .object({
        data: z.array(z.object({ line: z.string(), ts: z.string() })),
        total: z.number().optional(),
      })
      .parse(raw);
    return {
      text: result.data.map((r) => `${r.ts}  ${r.line}`).join("\n"),
      truncated: (result.total ?? result.data.length) > result.data.length,
    };
  }
  const result = z
    .object({
      lines: z.array(z.array(z.union([z.string(), z.number()]))),
      cursor: z.string().nullish(),
      truncated: z.boolean().optional(),
    })
    .parse(raw);
  return {
    text: result.lines.map((line) => line.join("  ")).join("\n"),
    cursor: result.truncated ? result.cursor || undefined : undefined,
    truncated: !!result.truncated,
  };
}
export async function readDeploymentData(
  context: Context,
  path: string[],
  parameters: Record<string, unknown>,
) {
  const plan = await prepare({ context, path, parameters });
  if (plan.classification !== "Read")
    throw Error("Deployment views only run read operations.");
  const result = await runPlan(plan, false, false);
  if (!result.success)
    throw Error(
      result.error ||
        "Could not load deployment data. Check account permissions and retry.",
    );
  return result.data;
}
export async function loadDeployments(
  resource: Resource,
  context: Context,
  builds: boolean,
  page: number,
) {
  if (resource.product === "Pages")
    return normalizeDeployments(
      await readDeploymentData(context, ["pages", "deployments", "list"], {
        project_name: resource.name,
        page,
        per_page: 20,
      }),
      "pages",
    );
  if (!builds)
    return normalizeDeployments(
      await readDeploymentData(context, ["workers", "deployments", "list"], {
        script_name: resource.name,
        page,
        per_page: 20,
      }),
      "deployments",
    );
  // Resource disk caches omit metadata, so recover the Worker tag when necessary.
  let tag = resource.metadata?.tag;
  if (typeof tag !== "string") {
    const workers = await loadResources(
      "Workers",
      context.accountId,
      context.profile,
    );
    tag = workers.find((worker) => worker.name === resource.name)?.metadata
      ?.tag;
  }
  if (typeof tag !== "string" || !tag)
    throw Error(
      "The Worker build identifier is unavailable. Refresh the Workers list and retry.",
    );
  return normalizeDeployments(
    await readDeploymentData(context, ["builds", "list"], {
      external_script_id: tag,
      page,
      per_page: 20,
    }),
    "builds",
  );
}
export async function buildsForDeployment(
  deployment: Deployment,
  context: Context,
) {
  if (deployment.buildId) return [deployment];
  if (!deployment.versions.length) return [];
  return normalizeDeployments(
    await readDeploymentData(context, ["builds", "versions", "get"], {
      version_ids: deployment.versions.join(","),
    }),
    "builds",
  );
}
export async function loadBuildLog(
  resource: Resource,
  context: Context,
  id: string,
  cursor?: string,
) {
  const pages = resource.product === "Pages";
  const data = await readDeploymentData(
    context,
    pages
      ? ["pages", "deployments", "history", "logs", "get"]
      : ["builds", "logs", "get"],
    pages
      ? { project_name: resource.name, deployment_id: id }
      : { build_uuid: id, ...(cursor ? { cursor } : {}) },
  );
  return normalizeBuildLog(data, pages);
}
export function sampleDeployments(resource: Resource): Deployment[] {
  return [0, 1].map((i) => ({
    id: `demo-${resource.id}-${i}`,
    buildId: `demo-build-${i}`,
    created: new Date(Date.now() - (i + 1) * 3600000).toISOString(),
    status: i ? "failed" : "success",
    label: i ? "preview · Update dependencies" : "main · Update application",
    versions: [`demo-version-${i}`],
  }));
}
