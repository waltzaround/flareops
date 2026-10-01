import { describe, expect, it, vi } from "vitest";
vi.mock("./cf", () => ({
  unwrap: (data: any) =>
    data && typeof data === "object" && "result" in data ? data.result : data,
  prepare: vi.fn(),
  runPlan: vi.fn(),
}));
import { prepare, runPlan } from "./cf";
import {
  loadProductItems,
  normalizeProductItems,
  productListParameters,
  productListResult,
  productPages,
} from "./products";
import { resourceGroups } from "./resource-catalog";

describe("product resources", () => {
  it("loads BotBase offsets and current catalog envelopes", () => {
    expect(productListParameters("BotBase", 2)).toEqual({
      limit: 20,
      offset: 20,
    });
    expect(
      productListResult("BotBase", {
        result: { bots: [{ slug: "example-bot", name: "Example Bot" }] },
      }).items[0].id,
    ).toBe("example-bot");
    expect(
      productListResult("R2 Data Catalog", {
        result: {
          warehouses: [{ bucket: "warehouse", id: "catalog-id" }],
        },
      }).items[0].id,
    ).toBe("warehouse");
    expect(
      productListResult("R2 Data Catalog", {
        result: {
          warehouses: Array.from({ length: 20 }, (_, i) => ({
            bucket: `bucket-${i}`,
          })),
        },
      }).hasNext,
    ).toBe(false);
  });
  it("includes every product in sidebar groups exactly once", () => {
    const entries = resourceGroups.flatMap((group) => group.kinds);
    for (const page of productPages)
      expect(entries.filter((item) => item === page)).toHaveLength(1);
  });
  it("handles media and Realtime envelopes without exposing credentials", () => {
    expect(
      normalizeProductItems({
        result: {
          images: [{ id: "image", filename: "banner.png", secret: "private" }],
        },
      }),
    ).toEqual([{ id: "image", name: "banner.png", detail: "" }]);
    expect(
      normalizeProductItems({
        result: { data: [{ id: "app", name: "Meetings" }] },
      })[0].name,
    ).toBe("Meetings");
    expect(
      normalizeProductItems([
        { uid: "video", meta: { name: "Launch" }, streamKey: "private" },
      ])[0],
    ).toEqual({ id: "video", name: "Launch", detail: "" });
  });
  it("rejects incompatible responses rather than reporting empty resources", () => {
    expect(() => normalizeProductItems({ changed: [] })).toThrow();
    expect(() => normalizeProductItems([null])).toThrow();
    expect(() => normalizeProductItems([{ secret: "private" }])).toThrow();
    expect(normalizeProductItems([])).toEqual([]);
  });
  it("uses the API's page and cursor parameters", () => {
    expect(productListParameters("RealtimeKit", 2)).toEqual({
      page_no: 2,
      per_page: 20,
    });
    expect(productListParameters("Hosted images", 2, "next")).toEqual({
      continuation_token: "next",
      per_page: 20,
    });
    expect(productListParameters("Hosted videos", 2, "2026-10-01")).toEqual({
      before: "2026-10-01",
      limit: 20,
    });
    expect(
      productListResult("Hosted images", {
        result: { images: [], continuation_token: "next" },
      }),
    ).toMatchObject({ hasNext: true, nextCursor: "next" });
    expect(productListResult("Hyperdrive", [])).toMatchObject({
      hasNext: false,
    });
  });
  it("reads widget IDs and network labels without displaying secrets", () => {
    expect(
      normalizeProductItems({
        result: [{ sitekey: "public-key", name: "Login", secret: "private" }],
      }),
    ).toEqual([{ id: "public-key", name: "Login", detail: "" }]);
    expect(
      normalizeProductItems([{ id: "route", network: "10.0.0.0/24" }])[0].name,
    ).toBe("10.0.0.0/24");
    expect(productListParameters("Tunnels", 2)).toEqual({
      is_deleted: false,
      page: 2,
      per_page: 20,
    });
    expect(productListParameters("Mesh", 1)).toEqual({
      is_deleted: false,
      page: 1,
      per_page: 20,
    });
  });
  it("keeps unrelated rules and lists out of WAF and Bulk redirects", () => {
    const lists = [
      { id: "redirects", kind: "redirect" },
      { id: "ips", kind: "ip" },
    ];
    expect(
      productListResult("Bulk redirects", lists).items.map((item) => item.id),
    ).toEqual(["redirects"]);
    const rulesets = [
      { id: "waf", phase: "http_request_firewall_managed" },
      { id: "cache", phase: "http_request_cache_settings" },
    ];
    expect(
      productListResult("WAF", rulesets).items.map((item) => item.id),
    ).toEqual(["waf"]);
  });
  it("never automatically executes a write from a resource list", async () => {
    vi.mocked(prepare).mockResolvedValue({ classification: "Write" } as any);
    await expect(
      loadProductItems(
        "Hyperdrive",
        { accountId: "account", profile: "profile" },
        1,
      ),
    ).rejects.toThrow("read operations");
    expect(runPlan).not.toHaveBeenCalled();
  });
});
