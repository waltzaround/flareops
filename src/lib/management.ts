import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
export type ManagementRequest = {
  product: "Worker" | "Pages";
  resource: string;
  section: "settings" | "domains";
  action?: "settings" | "attach" | "remove";
  values?: Record<string, unknown>;
};
export type ManagementContext = { profile: string; accountId: string };
const viewSchema = z.object({
  settings: z.record(z.unknown()).optional(),
  domains: z
    .array(
      z.object({
        id: z.string(),
        hostname: z.string(),
        target: z.string(),
        environment: z.string(),
        zoneId: z.string(),
        status: z.string(),
        dnsAvailable: z.boolean(),
      }),
    )
    .optional(),
  zones: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
  targets: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .optional(),
});
const planSchema = z.object({
  id: z.string(),
  before: z.unknown(),
  after: z.unknown(),
  warning: z.string(),
});
export type ManagementView = z.infer<typeof viewSchema>;
export type ManagementPlan = z.infer<typeof planSchema>;
export const readManagement = async (
  context: ManagementContext,
  request: ManagementRequest,
) => viewSchema.parse(await invoke("management_read", { ...context, request }));
export const prepareManagement = async (
  context: ManagementContext,
  request: ManagementRequest,
) =>
  planSchema.parse(await invoke("management_prepare", { ...context, request }));
export const applyManagement = (context: ManagementContext, id: string) =>
  invoke("management_apply", { ...context, id, confirmed: true });
