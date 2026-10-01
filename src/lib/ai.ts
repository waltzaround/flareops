import { z } from "zod";
import { prepare, runPlan, unwrap } from "./cf";
import type { Context } from "./types";

export const aiChildren = [
  "Models",
  "Workers AI",
  "AI Gateway",
  "MCP Portals",
  "Vectorize",
  "AI Search",
  "Agent tracing",
] as const;
export type AIChild = (typeof aiChildren)[number];
export type AIPage = "AI" | AIChild;
export const aiPages: readonly AIPage[] = ["AI", ...aiChildren];
export const aiDescriptions: Record<AIChild, string> = {
  Models: "Browse the models available on Workers AI.",
  "Workers AI": "Explore supported inference tasks on Cloudflare.",
  "AI Gateway": "View your gateways for AI requests.",
  "MCP Portals": "View portals that connect clients to MCP servers.",
  Vectorize: "Explore your vector indexes for semantic search.",
  "AI Search": "View your search instances by namespace.",
  "Agent tracing": "Inspect agent sessions, model calls, and tool runs.",
};
export const aiCommands: Partial<
  Record<AIChild, { path: string[]; paginated: boolean }>
> = {
  Models: { path: ["ai", "models", "list"], paginated: true },
  "Workers AI": { path: ["ai", "tasks", "list"], paginated: false },
  "AI Gateway": { path: ["ai-gateway", "gateways", "list"], paginated: true },
  "MCP Portals": { path: ["mcp", "portals", "list"], paginated: true },
  Vectorize: { path: ["vectorize", "list"], paginated: false },
  "AI Search": { path: ["ai-search", "list"], paginated: true },
};
export type AIItem = {
  id: string;
  name: string;
  description: string;
  detail: string;
};
export function normalizeAIItems(data: unknown): AIItem[] {
  let raw = unwrap(data);
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const object = raw as Record<string, unknown>;
    raw =
      object.items ??
      object.instances ??
      object.models ??
      object.portals ??
      object;
  }
  return z
    .array(z.record(z.unknown()))
    .parse(raw)
    .map((r) => {
      const id = r.id ?? r.uuid ?? r.name;
      if (typeof id !== "string")
        throw Error("AI response is missing an identifier.");
      const task =
        r.task && typeof r.task === "object"
          ? (r.task as Record<string, unknown>).name
          : undefined;
      return {
        id,
        name: typeof r.name === "string" ? r.name : id,
        description: typeof r.description === "string" ? r.description : "",
        detail: [r.status, task, r.type]
          .filter((value) => typeof value === "string")
          .join(" · "),
      };
    });
}
export async function loadAIItems(
  page: AIChild,
  context: Context,
  number: number,
  namespace: string,
) {
  const config = aiCommands[page];
  if (!config)
    throw Error("This view is not available through the bundled CLI.");
  const parameters = {
    ...(config.paginated ? { page: number, per_page: 20 } : {}),
    ...(page === "AI Search" ? { name: namespace } : {}),
  };
  const plan = await prepare({ context, path: config.path, parameters });
  if (plan.classification !== "Read")
    throw Error("AI views only run read operations.");
  const result = await runPlan(plan, false, false);
  if (!result.success)
    throw Error(
      result.error || "Could not load AI data. Check account access and retry.",
    );
  return normalizeAIItems(result.data);
}
