import { describe, expect, it } from "vitest";
import {
  areaForPage,
  groupsForArea,
  productAreas,
  managementPage,
} from "./navigation";
import { resourceGroups } from "./resource-catalog";
import { productPages } from "./products";
import { useUI } from "./store";

describe("navigation sections", () => {
  it("puts every product group in exactly one section", () => {
    const labels = productAreas.flatMap((area) =>
      groupsForArea(area).map((group) => group.label),
    );
    expect(labels.sort()).toEqual(
      resourceGroups.map((group) => group.label).sort(),
    );
    for (const page of productPages) expect(areaForPage(page)).not.toBe("Home");
  });
  it("routes direct navigation and search results to their matching section", () => {
    expect(areaForPage("Projects")).toBe("Home");
    expect(areaForPage("Cloudflare")).toBe("Build");
    expect(areaForPage("Workers")).toBe("Build");
    expect(areaForPage("Hosted videos")).toBe("Media");
    expect(areaForPage("DNS")).toBe("Network");
    expect(areaForPage("WAF")).toBe("Security");
    expect(areaForPage("Worker traffic")).toBe("Workspace");
    expect(areaForPage("Workers AI")).toBe("AI");
    expect(groupsForArea("Home")).toEqual([]);
  });
  it("remembers each group's expanded or collapsed choice independently", () => {
    useUI.getState().setSidebarGroup("Compute", true);
    useUI.getState().setSidebarGroup("Storage & databases", false);
    expect(useUI.getState().sidebarGroups).toMatchObject({
      Compute: true,
      "Storage & databases": false,
    });
    useUI.getState().navigate("Media");
    expect(useUI.getState().sidebarGroups.Compute).toBe(true);
  });
});

it("redirects retired project destinations to management pages", () => {
  expect(managementPage("Projects")).toBe("Home");
  expect(managementPage("Cloudflare")).toBe("Build");
  useUI.getState().navigate("Projects");
  expect(useUI.getState().page).toBe("Home");
  useUI.getState().setDefaultPage("Cloudflare");
  expect(useUI.getState().defaultPage).toBe("Build");
  useUI.getState().setDefaultPage("Home");
});
