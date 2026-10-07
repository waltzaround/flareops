import { z } from "zod";
export const startSchema = z.object({
  prompt: z.string().trim().min(1).max(20000),
  provider: z.literal("cloudflare").default("cloudflare"),
  model: z
    .string()
    .regex(/^@cf\/[a-zA-Z0-9._/-]+$/)
    .max(200)
    .optional(),
  repository: z.enum(["artifacts", "github"]).default("artifacts"),
  requestId: z.string().uuid(),
});
export const migrationSchema = z.object({
  owner: z.string().regex(/^[a-zA-Z0-9-]{1,39}$/),
  name: z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/),
  confirm: z.literal(true),
});
export type Repository = {
  host: "artifacts" | "github";
  name: string;
  remote: string;
  defaultBranch: string;
  owner?: string;
};
export type AgentResult = {
  status: "running" | "complete" | "failed" | "cancelled";
  branch: string;
  steps: number;
  summary?: string;
  error?: string;
  tokens: number;
};
export type Run = {
  id: string;
  prompt: string;
  model: string;
  status:
    | "imported"
    | "provisioning"
    | "running"
    | "review"
    | "merging"
    | "merged"
    | "failed"
    | "cancelled";
  createdAt: string;
  name: string;
  repo?: Repository;
  previousRepo?: Repository;
  base?: string;
  reviewHead?: string;
  diff?: string;
  agents: AgentResult[];
  events: { at: string; message: string }[];
  previewBundle?: { bytes: number; sha256: string };
  usage?: import("./budget").Usage;
  validation?: { exitCode: number; output: string };
  error?: string;
  migration?: {
    target: Repository;
    refs: Record<string, string>;
    verified: boolean;
  };
};
export const terminal = (status: string) =>
  ["complete", "failed", "cancelled"].includes(status);
export function assertSameRefs(
  source: Record<string, string>,
  target: Record<string, string>,
) {
  if (!Object.keys(source).length)
    throw new Error("Source has no branches or tags.");
  for (const [ref, oid] of Object.entries(source))
    if (target[ref] !== oid)
      throw new Error(
        `Migration verification failed for ${ref}. Source remains authoritative.`,
      );
}
export function safeRemote(remote: string, host: Repository["host"]) {
  const url = new URL(remote);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (host === "github"
      ? url.hostname !== "github.com"
      : !url.hostname.endsWith(".artifacts.cloudflare.net"))
  )
    throw new Error("Invalid repository remote.");
  return remote;
}
