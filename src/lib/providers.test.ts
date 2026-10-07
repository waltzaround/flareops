import { beforeEach, describe, expect, it } from "vitest";
import {
  defaultProvider,
  providerScopeKey,
  providerSnapshot,
  useProviders,
} from "./providers";
import { useProjects } from "./projects";
const scope = { mode: "live", accountId: "account-a", profile: "first" };
beforeEach(() => {
  useProviders.setState({ configs: {} });
  useProjects.setState({ projects: [] });
});
describe("provider configuration", () => {
  it("defaults to Cloudflare and isolates selections by account, profile, and mode", () => {
    expect(defaultProvider.provider).toBe("cloudflare");
    useProviders
      .getState()
      .save(scope, { provider: "openai", model: "chosen-model", endpoint: "" });
    expect(
      useProviders.getState().configs[providerScopeKey(scope)].provider,
    ).toBe("openai");
    for (const other of [
      { ...scope, mode: "demo" },
      { ...scope, profile: "second" },
      { ...scope, accountId: "b" },
    ]) {
      expect(
        useProviders.getState().configs[providerScopeKey(other)],
      ).toBeUndefined();
    }
  });
  it("persists only metadata, stripping secrets and non-custom endpoints", () => {
    const input = {
      provider: "openai" as const,
      model: "model",
      endpoint: "https://example.com",
      apiKey: "test-secret",
    };
    useProviders.getState().save(scope, input);
    expect(JSON.stringify(useProviders.getState().configs)).not.toContain(
      "test-secret",
    );
    expect(providerSnapshot(input).endpoint).toBe("");
  });
  it("validates compatible endpoints and permits local servers", () => {
    const compatible = {
      provider: "compatible" as const,
      model: "model",
      endpoint: "http://localhost:11434/v1/",
    };
    expect(providerSnapshot(compatible).endpoint).toBe(
      "http://localhost:11434/v1",
    );
    for (const endpoint of [
      "",
      "http://example.com/v1",
      "https://user:pass@example.com",
      "https://example.com?key=secret",
      "https://example.com/#secret",
      "file:///tmp/key",
    ]) {
      expect(() => providerSnapshot({ ...compatible, endpoint })).toThrow();
    }
  });
  it("retains each prompt's provider even after settings change", () => {
    const config = {
      provider: "openai" as const,
      model: "original",
      endpoint: "",
    };
    const id = useProjects
      .getState()
      .createProject(scope, "Build a dashboard", config);
    config.model = "changed";
    useProjects.getState().addPrompt(id, scope, "Add charts", defaultProvider);
    expect(
      useProjects.getState().projects[0].prompts.map((p) => p.provider),
    ).toEqual([
      { provider: "openai", model: "original", endpoint: "" },
      defaultProvider,
    ]);
  });
});
