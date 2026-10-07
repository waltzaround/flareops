import type { Page } from "./types";
import { resourceGroups } from "./resource-catalog";
import { aiPages, type AIPage } from "./ai";

export const productAreas = ["Build", "Media", "Network", "Security"] as const;
export type ProductArea = (typeof productAreas)[number];
export type NavigationArea =
  "Home" | ProductArea | "AI" | "Workspace" | "Settings";
export const areaGroups: Record<ProductArea, string[]> = {
  Build: ["Compute", "Storage & databases", "Messaging & workflows"],
  Media: ["Images & Stream", "Realtime"],
  Network: ["Networking", "Delivery & performance"],
  Security: ["Application security"],
};
export const workspacePages: Page[] = [
  "Workspace",
  "Explorer",
  "Account analytics",
  "Web analytics",
  "Worker traffic",
  "Command analytics",
  "Log Explorer",
  "Rule simulator",
  "Logpush",
  "Cron triggers",
  "Activity",
];
export function groupsForArea(area: NavigationArea) {
  return resourceGroups.filter(
    (group) =>
      productAreas.includes(area as ProductArea) &&
      areaGroups[area as ProductArea].includes(group.label),
  );
}
export function areaForPage(page: Page): NavigationArea {
  page = managementPage(page);
  if (page === "Home" || page === "Settings") return page;
  if (aiPages.includes(page as AIPage)) return "AI";
  if (workspacePages.includes(page)) return "Workspace";
  if (productAreas.includes(page as ProductArea)) return page as ProductArea;
  return (
    productAreas.find((area) =>
      groupsForArea(area).some((group) => group.kinds.includes(page)),
    ) ?? "Home"
  );
}

// Compatibility with preferences saved during the Projects experiment.
export function managementPage(page: Page): Page {
  return page === "Projects" ? "Home" : page === "Cloudflare" ? "Build" : page;
}
