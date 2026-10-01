import { afterEach, describe, expect, it } from "vitest";
import { cachedResources, queryClient } from "./query";

afterEach(() => queryClient.clear());

describe("cached resources for search", () => {
  const scope = ["resources", "live", "work", "account"];
  const worker = { id: "edge", name: "Edge API", kind: "Workers" };

  it("searches resources after Worker traffic statistics have loaded", () => {
    queryClient.setQueryData([...scope, "Workers", ""], [worker]);
    queryClient.setQueryData([...scope, "worker-traffic"], {
      requests: { "Edge API": 12400 },
      start: "2026-10-01",
      end: "2026-10-02",
    });

    const matches = cachedResources("live", "work", "account").filter((r) =>
      r.name.toLowerCase().includes("edge"),
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject(worker);
  });

  it("keeps search scoped to the active mode, profile, and account", () => {
    for (const key of [
      ["resources", "demo", "work", "account", "Workers", ""],
      ["resources", "live", "personal", "account", "Workers", ""],
      ["resources", "live", "work", "another", "Workers", ""],
    ]) {
      queryClient.setQueryData(key, [worker]);
    }
    expect(cachedResources("live", "work", "account")).toEqual([]);
  });

  it("skips incompatible cached entries while preserving usable resources", () => {
    queryClient.setQueryData([...scope, "Workers", ""], [
      null,
      { id: "missing-name", kind: "Workers" },
      worker,
    ]);
    queryClient.setQueryData([...scope, "Zones", ""], { unexpected: true });
    queryClient.setQueryData([...scope, "DNS", "zone"], [
      { id: "dns", name: "api.example.com", kind: "DNS" },
    ]);
    expect(cachedResources("live", "work", "account").map((r) => r.id)).toEqual([
      "edge",
      "dns",
    ]);
  });
});
