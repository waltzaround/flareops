import { it, expect, vi } from "vitest";
import { reviewDiff, bundlePath } from "./preview";
it("keeps generated bundles out of the source diff while recording their digest", async () => {
  const ws: any = {
    git: {
      diffSummary: vi.fn().mockResolvedValue([
        { path: "src/app.ts", status: "M" },
        { path: bundlePath, status: "A" },
      ]),
      diff: vi.fn().mockResolvedValue("source diff"),
      show: vi.fn().mockResolvedValue({ tree: "review-tree" }),
      catFile: vi
        .fn()
        .mockResolvedValue({
          bytes: new TextEncoder().encode("export default {}"),
        }),
    },
  };
  const result = await reviewDiff(ws, "base", "head");
  expect(ws.git.diff).toHaveBeenCalledWith({
    dir: "/workspace",
    ref: "base",
    to: "head",
    paths: ["src/app.ts"],
  });
  expect(result.previewBundle?.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(result.diff).toContain("View bundle");
});
it("still refuses oversized source diffs and oversized bundles", async () => {
  const ws: any = {
    git: {
      diffSummary: vi
        .fn()
        .mockResolvedValue([{ path: "src/app.ts", status: "M" }]),
      diff: vi.fn().mockResolvedValue("x".repeat(60001)),
    },
  };
  await expect(reviewDiff(ws, "base", "head")).rejects.toThrow("Source diff");
  ws.git.diffSummary.mockResolvedValue([{ path: bundlePath, status: "A" }]);
  ws.git.show = vi.fn().mockResolvedValue({ tree: "tree" });
  ws.git.catFile = vi
    .fn()
    .mockResolvedValue({ bytes: new Uint8Array(2000001) });
  await expect(reviewDiff(ws, "base", "head")).rejects.toThrow("size limit");
});

import { readPreviewResources } from "./preview";
it("reads optional storage declarations only from the reviewed tree", async () => {
  const ws: any = {
    git: {
      lsTree: vi
        .fn()
        .mockResolvedValueOnce([{ path: ".flareops" }])
        .mockResolvedValueOnce([{ path: "preview" }])
        .mockResolvedValueOnce([{ path: "resources.json" }]),
      show: vi.fn().mockResolvedValue({ tree: "committed-tree" }),
      catFile: vi
        .fn()
        .mockResolvedValue({
          bytes: new TextEncoder().encode('[{"type":"d1","binding":"DB"}]'),
        }),
    },
  };
  expect(await readPreviewResources(ws, "review-head")).toEqual([
    { type: "d1", binding: "DB" },
  ]);
  expect(ws.git.catFile).toHaveBeenCalledWith({
    dir: "/workspace",
    oid: "committed-tree",
    filepath: ".flareops/preview/resources.json",
  });
  ws.git.lsTree.mockResolvedValue([]);
  expect(await readPreviewResources(ws, "old-review")).toEqual([]);
});
it("rejects malformed manifests rather than silently dropping data bindings", async () => {
  const ws: any = {
    git: {
      lsTree: vi
        .fn()
        .mockResolvedValue([
          { path: ".flareops" },
          { path: "preview" },
          { path: "resources.json" },
        ]),
      show: vi.fn().mockResolvedValue({ tree: "tree" }),
      catFile: vi
        .fn()
        .mockResolvedValue({ bytes: new TextEncoder().encode("invalid json") }),
    },
  };
  await expect(readPreviewResources(ws, "head")).rejects.toThrow();
});
