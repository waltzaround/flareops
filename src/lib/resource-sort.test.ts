import { describe, it, expect } from "vitest";
import { sortResources } from "./resource-sort";
import type { Resource } from "./types";
const rows = [
  { id: "a", name: "worker-10", modified: "2026-01-02" },
  { id: "b", name: "worker-2", modified: "2025-12-31" },
  { id: "c", name: "empty", modified: "" },
].map((r) => ({
  ...r,
  kind: "Workers",
  status: "Available",
  description: "",
})) as Resource[];
describe("table sorting", () => {
  it("sorts names naturally without changing cached rows", () => {
    expect(sortResources(rows, "name", "asc").map((r) => r.id)).toEqual([
      "c",
      "b",
      "a",
    ]);
    expect(rows[0].id).toBe("a");
  });
  it("sorts timestamps and keeps missing dates last both directions", () => {
    expect(sortResources(rows, "modified", "desc").map((r) => r.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(sortResources(rows, "modified", "asc").map((r) => r.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });
  it("sorts traffic numerically including zero requests", () => {
    expect(
      sortResources(rows, "traffic", "desc", {
        "worker-10": 9,
        "worker-2": 100,
      }).map((r) => r.id),
    ).toEqual(["b", "a", "c"]);
  });
});

it("does not mistake Pages traffic for a same-name Worker", () => {
  const pages = { ...rows[0], id: "pages:a", product: "Pages" as const };
  expect(
    sortResources([pages, rows[0]], "traffic", "asc", {
      [rows[0].name]: 10,
    }).map((r) => r.id),
  ).toEqual(["a", "pages:a"]);
});
