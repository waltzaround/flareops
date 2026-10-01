import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Account } from "./types";
let useUI: typeof import("./store").useUI;
const account = (profile: string): Account => ({
  id: "shared-account",
  name: "Production",
  profile,
  workspace: "Work",
  color: "#aaa",
});
beforeAll(async () => {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  });
  useUI = (await import("./store")).useUI;
});
beforeEach(() =>
  useUI.setState({
    knownAccounts: [],
    mode: "live",
    account: account("personal"),
    zone: "",
    recent: [],
  }),
);
describe("account login bindings", () => {
  it("retains distinct login bindings for the same account ID", () => {
    useUI.getState().rememberAccounts([account("work"), account("personal")]);
    useUI
      .getState()
      .rememberAccounts([{ ...account("work"), name: "Renamed" }]);
    expect(useUI.getState().knownAccounts).toHaveLength(2);
    expect(
      useUI.getState().knownAccounts.find((a) => a.profile === "personal")
        ?.name,
    ).toBe("Production");
  });
  it("removes only the deleted profile and clears selection when its login is removed", () => {
    useUI.getState().rememberAccounts([account("work"), account("personal")]);
    useUI.getState().forgetProfile("work");
    expect(useUI.getState().account.profile).toBe("personal");
    expect(useUI.getState().knownAccounts.map((a) => a.profile)).toEqual([
      "personal",
    ]);
    useUI.getState().forgetProfile("personal");
    expect(useUI.getState().account.id).toBe("");
    expect(useUI.getState().knownAccounts).toEqual([]);
  });
});

describe("recent analytics navigation", () => {
  beforeEach(() => useUI.setState({ recentAnalytics: [] }));
  it("tracks analytics and logs in visit order without duplicates or resource pages", () => {
    const { navigate } = useUI.getState();
    navigate("Worker traffic");
    navigate("Command analytics");
    navigate("Activity");
    navigate("Worker traffic");
    navigate("Workers");
    navigate("Explorer");
    expect(useUI.getState().recentAnalytics).toEqual([
      "Worker traffic",
      "Activity",
      "Command analytics",
    ]);
  });
  it("clears analytics recents when switching account profiles or modes", () => {
    useUI.getState().navigate("Worker traffic");
    useUI.getState().setAccount(account("work"));
    expect(useUI.getState().recentAnalytics).toEqual([]);
    useUI.getState().navigate("Activity");
    useUI.getState().setMode("demo");
    expect(useUI.getState().recentAnalytics).toEqual([]);
  });
});

describe("Home shortcut navigation", () => {
  it("keeps the Home sidebar while moving between shortcut destinations", () => {
    useUI.getState().navigate("Workers", "Home");
    expect(useUI.getState().page).toBe("Workers");
    expect(useUI.getState().sidebarOverride).toBe("Home");
    useUI.getState().navigate("DNS", "Home");
    expect(useUI.getState().page).toBe("DNS");
    expect(useUI.getState().sidebarOverride).toBe("Home");
  });
  it("releases the Home sidebar when navigating to another section", () => {
    useUI.getState().navigate("Workers", "Home");
    useUI.getState().navigate("AI");
    expect(useUI.getState().sidebarOverride).toBeNull();
    expect(useUI.getState().page).toBe("AI");
  });
});
