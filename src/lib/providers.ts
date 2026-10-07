import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ProjectScope } from "./projects";

export const providerLabels = {
  cloudflare: "Cloudflare Workers AI",
  openai: "OpenAI",
  anthropic: "Anthropic",
  compatible: "Other · OpenAI compatible",
} as const;
export type Provider = keyof typeof providerLabels;
export type ProviderConfig = {
  provider: Provider;
  model: string;
  endpoint: string;
};
export const defaultProvider: ProviderConfig = {
  provider: "cloudflare",
  model: "",
  endpoint: "",
};
export const providerScopeKey = (scope: ProjectScope) =>
  JSON.stringify([scope.mode, scope.accountId, scope.profile]);

// Explicit allowlist: keys and arbitrary caller properties must never enter persistence.
export function providerSnapshot(value: ProviderConfig): ProviderConfig {
  if (!(value.provider in providerLabels))
    throw new Error("Choose a supported provider.");
  let endpoint = "";
  if (value.provider === "compatible") {
    let url: URL;
    try {
      url = new URL(value.endpoint);
    } catch {
      throw new Error("Enter an API base URL.");
    }
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        "Use HTTPS, or HTTP on localhost, without credentials or query parameters.",
      );
    }
    endpoint = url.toString().replace(/\/+$/, "");
  }
  return {
    provider: value.provider,
    model: value.model.trim().slice(0, 200),
    endpoint,
  };
}
export const useProviders = create<{
  configs: Record<string, ProviderConfig>;
  save: (scope: ProjectScope, config: ProviderConfig) => void;
}>()(
  persist(
    (set) => ({
      configs: {},
      save: (scope, config) => {
        const clean = providerSnapshot(config);
        set((state) => ({
          configs: { ...state.configs, [providerScopeKey(scope)]: clean },
        }));
      },
    }),
    { name: "flareops-ai-providers", version: 1 },
  ),
);
