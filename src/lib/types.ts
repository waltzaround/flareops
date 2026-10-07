import { z } from "zod";
export type Page =
  | "Build"
  | "Media"
  | "Network"
  | "Security"
  | import("./products").ProductPage
  | "AI"
  | "Models"
  | "Workers AI"
  | "AI Gateway"
  | "MCP Portals"
  | "Vectorize"
  | "AI Search"
  | "Agent tracing"
  | "Projects"
  | "Cloudflare"
  | "Home"
  | "Workers"
  | "Zones"
  | "DNS"
  | "D1"
  | "R2"
  | "KV"
  | "Containers"
  | "Durable Objects"
  | "Workflows"
  | "Workers for Platforms"
  | "Queues"
  | "Explorer"
  | "Workspace"
  | "Account analytics"
  | "Web analytics"
  | "Worker traffic"
  | "Command analytics"
  | "Log Explorer"
  | "Rule simulator"
  | "Logpush"
  | "Cron triggers"
  | "Activity"
  | "Settings";
export const resourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum([
    "Workers",
    "Zones",
    "DNS",
    "D1",
    "R2",
    "KV",
    "Queues",
    "Containers",
    "Durable Objects",
    "Workflows",
    "Workers for Platforms",
  ]),
  product: z.enum(["Worker", "Pages"]).optional(),
  status: z.string().default("Available"),
  description: z.string().default(""),
  modified: z.string().default(""),
  type: z.string().optional(),
  content: z.string().optional(),
  proxied: z.boolean().optional(),
  ttl: z.number().optional(),
  zoneId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type Resource = z.infer<typeof resourceSchema>;
export type Account = {
  id: string;
  name: string;
  profile: string;
  workspace: string;
  color: string;
};
export type Context = { profile: string; accountId: string; zoneId?: string };
export type Request = {
  path: string[];
  context: Context;
  parameters: Record<string, unknown>;
  body?: unknown;
};
export type Plan = {
  id: string;
  command: string;
  classification: "Read" | "Create" | "Modify" | "Destructive";
  request: Request;
  args: string[];
  schema: CommandSchema;
  dryRunSupported: boolean;
  createdAt: number;
};
export type Execution = {
  id: string;
  success: boolean;
  data: unknown;
  rawStdout: string;
  rawStderr: string;
  exitCode: number;
  durationMs: number;
  command: string;
  profile: string;
  accountId: string;
  zoneId?: string;
  startedAt: string;
  finishedAt: string;
  error?: string;
};
export type Parameter = {
  name: string;
  type: string;
  required?: boolean;
  enum?: string[];
  description?: string;
};
export type CommandSchema = {
  httpMethod: string;
  path: string;
  pathParams: Parameter[];
  queryParams: Parameter[];
  hasRequestBody: boolean;
  requestBodyFields: Parameter[];
};
export type Discovery = {
  command: string;
  description: string;
  fullPath: string[];
};
export type Diagnostics = {
  source: "bundled" | "system" | "missing";
  runtimeBinary?: string;
  os: string;
  nodeVersion?: string;
  binary?: string;
  version?: string;
  minimumNode: string;
  supportedRange: string;
};
export const paths: Partial<Record<Page, string[]>> = {
  Workers: ["workers", "list"],
  Zones: ["zones", "list"],
  DNS: ["dns", "records", "list"],
  D1: ["d1", "list"],
  R2: ["r2", "buckets", "list"],
  KV: ["kv", "namespaces", "list"],
  Queues: ["queues", "list"],
  Containers: ["containers", "applications", "list"],
  "Durable Objects": ["durable-objects", "namespaces", "list"],
  Workflows: ["workflows", "list"],
  "Workers for Platforms": [
    "workers-for-platforms",
    "dispatch-namespaces",
    "list",
  ],
};
export function internalUrl(accountId: string, page: Page, id?: string) {
  return `cloudapp://account/${encodeURIComponent(accountId)}/${page.toLowerCase()}${id ? "/" + encodeURIComponent(id) : ""}`;
}
export function parseInternalUrl(url: string) {
  const u = new URL(url);
  if (u.protocol !== "cloudapp:" || u.hostname !== "account")
    throw Error("Unknown resource link");
  const [accountId, section, id] = u.pathname
    .slice(1)
    .split("/")
    .map(decodeURIComponent);
  const page = (Object.keys(paths) as Page[]).find(
    (p) => p.toLowerCase() === section,
  );
  if (!accountId || !page) throw Error("Unknown resource link");
  return { accountId, page, id };
}
