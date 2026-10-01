import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { isDesktop } from "./store";
const metric = z.number().finite().nonnegative().nullable();
const token = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  issued: z.string(),
  expires: z.string(),
  lastUsed: z.string(),
});
const agent = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  traceId: z.string(),
  started: metric,
  duration: metric,
  inputTokens: metric,
  outputTokens: metric,
  spans: metric,
  models: z.array(z.string()),
  services: z.array(z.string()),
});
export const tokenResult = z.object({
  items: z.array(token),
  hasNext: z.boolean(),
  nextCursor: z.string().nullable(),
});
export const agentResult = z.object({
  items: z.array(agent),
  hasNext: z.boolean(),
  nextCursor: z.string().nullable(),
});
export async function accountRead(
  kind: "tokens" | "agents",
  profile: string,
  accountId: string,
  options: Record<string, unknown>,
  demo: boolean,
): Promise<unknown> {
  if (demo)
    return {
      items:
        kind === "tokens"
          ? [
              {
                id: "sample-token",
                name: "Deployment automation",
                status: "active",
                issued: "2026-09-01T00:00:00Z",
                expires: "",
                lastUsed: "",
              },
            ]
          : [
              {
                id: "sample-run",
                name: "Support agent",
                status: "completed",
                traceId: "sample-trace",
                started: Date.now() - 120000,
                duration: 1240,
                inputTokens: 530,
                outputTokens: 125,
                spans: 8,
                models: ["Sample model"],
                services: ["support-worker"],
              },
            ],
      hasNext: false,
      nextCursor: null,
    };
  if (!isDesktop) throw Error("Open the desktop app to load account data.");
  return invoke("account_read", { profile, accountId, kind, options });
}
