import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./cf", () => ({
  prepare: vi.fn(),
  runPlan: vi.fn(),
  unwrap: (data: unknown) =>
    data && typeof data === "object" && "result" in data ? data.result : data,
}));
import { prepare, runPlan } from "./cf";
import { aiChildren, aiCommands, normalizeAIItems, loadAIItems } from "./ai";
import type { Plan, Execution } from "./types";
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prepare).mockResolvedValue({
    id: "read",
    classification: "Read",
  } as Plan);
  vi.mocked(runPlan).mockResolvedValue({
    success: true,
    data: [],
  } as unknown as Execution);
});
describe("AI navigation and data", () => {
  it("includes every requested child and does not map agent tracing to zone tracing", () => {
    expect(aiChildren).toEqual([
      "Models",
      "Workers AI",
      "AI Gateway",
      "MCP Portals",
      "Vectorize",
      "AI Search",
      "Agent tracing",
    ]);
    expect(aiCommands["Agent tracing"]).toBeUndefined();
  });
  it("normalizes API lists without exposing arbitrary fields", () => {
    expect(
      normalizeAIItems({
        result: [
          {
            id: "model",
            name: "Example",
            task: { name: "Text generation" },
            secret: "hidden",
          },
        ],
      }),
    ).toEqual([
      {
        id: "model",
        name: "Example",
        description: "",
        detail: "Text generation",
      },
    ]);
    expect(
      normalizeAIItems({ result: { instances: [{ name: "search" }] } })[0].id,
    ).toBe("search");
    expect(() => normalizeAIItems({ unknown: [] })).toThrow();
  });
  it("scopes paginated search requests to the selected account and namespace", async () => {
    const context = { accountId: "account", profile: "work" };
    await loadAIItems("AI Search", context, 2, "knowledge");
    expect(prepare).toHaveBeenCalledWith({
      context,
      path: ["ai-search", "list"],
      parameters: { page: 2, per_page: 20, name: "knowledge" },
    });
  });
  it("rejects mutations and surfaces permission errors", async () => {
    vi.mocked(prepare).mockResolvedValueOnce({
      classification: "Create",
    } as Plan);
    await expect(
      loadAIItems(
        "AI Gateway",
        { accountId: "a", profile: "work" },
        1,
        "default",
      ),
    ).rejects.toThrow("read operations");
    expect(runPlan).not.toHaveBeenCalled();
    vi.mocked(runPlan).mockResolvedValueOnce({
      success: false,
      error: "Permission denied",
    } as Execution);
    await expect(
      loadAIItems("Models", { accountId: "a", profile: "work" }, 1, "default"),
    ).rejects.toThrow("Permission denied");
  });
});
