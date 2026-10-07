import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { isDesktop } from "./store";
import type { ProjectScope } from "./projects";
import { providerScopeKey } from "./providers";
export type Run = {
  id: string;
  name: string;
  status: string;
  error?: string;
  diff?: string;
  reviewHead?: string;
  repo?: { remote: string; defaultBranch: string };
  usage?: {
    inputTokens: number;
    outputTokens: number;
    estimatedMicrousd: number;
    reservedMicrousd: number;
  };
  agents: {
    status: string;
    branch: string;
    steps: number;
    tokens: number;
    summary?: string;
    error?: string;
  }[];
  events: { at: string; message: string }[];
};
export const useHarness = create<{
  endpoints: Record<string, string>;
  save: (scope: ProjectScope, endpoint: string) => void;
}>()(
  persist(
    (set) => ({
      endpoints: {},
      save: (scope, endpoint) =>
        set((s) => ({
          endpoints: { ...s.endpoints, [providerScopeKey(scope)]: endpoint },
        })),
    }),
    { name: "flareops-harness-connections", version: 1 },
  ),
);
export function harnessScope(scope: ProjectScope, endpoint: string) {
  if (!isDesktop || scope.mode !== "live")
    throw new Error("Agent execution requires the desktop app in live mode.");
  return { accountId: scope.accountId, profile: scope.profile, endpoint };
}
export function harnessCall<T>(
  scope: ProjectScope,
  endpoint: string,
  action: string,
  projectId?: string,
  body?: unknown,
) {
  return invoke<T>("harness_request", {
    scope: harnessScope(scope, endpoint),
    action,
    projectId,
    body,
  });
}
