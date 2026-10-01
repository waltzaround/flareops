import { describe, expect, it, vi, beforeEach } from "vitest";
vi.mock("./cf", () => ({
  unwrap: (data: unknown) =>
    data && typeof data === "object" && "result" in data ? data.result : data,
  prepare: vi.fn(),
  runPlan: vi.fn(),
  loadResources: vi.fn(),
}));
import { prepare, runPlan, loadResources } from "./cf";
import {
  normalizeDeployments,
  normalizeBuildLog,
  loadDeployments,
  loadBuildLog,
  buildsForDeployment,
  readDeploymentData,
} from "./deployments";
import type { Plan, Execution, Resource } from "./types";
const context = { accountId: "account", profile: "work" };
const worker: Resource = {
  id: "api",
  name: "api",
  kind: "Workers",
  status: "Available",
  description: "",
  modified: "",
  metadata: { tag: "worker-tag" },
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(prepare).mockResolvedValue({
    id: "plan",
    classification: "Read",
  } as Plan);
  vi.mocked(runPlan).mockResolvedValue({
    success: true,
    data: [],
  } as unknown as Execution);
});
describe("deployment response adapters", () => {
  it("reads Worker deployment envelopes and all version IDs", () => {
    expect(
      normalizeDeployments(
        {
          result: {
            deployments: [
              {
                id: "d1",
                created_on: "2026-10-01",
                versions: [{ version_id: "v1" }, { version_id: "v2" }],
              },
            ],
          },
        },
        "deployments",
      )[0],
    ).toMatchObject({ id: "d1", status: "Deployed", versions: ["v1", "v2"] });
  });
  it("shows failed build outcomes instead of a stopped status", () => {
    expect(
      normalizeDeployments(
        [
          {
            build_uuid: "b1",
            status: "stopped",
            build_outcome: "fail",
            build_trigger_metadata: {
              branch: "main",
              commit_message: "Fix build",
            },
          },
        ],
        "builds",
      )[0],
    ).toMatchObject({
      buildId: "b1",
      status: "fail",
      label: "main · Fix build",
    });
  });
  it("reads Pages stage status and rejects malformed deployment lists", () => {
    expect(
      normalizeDeployments(
        [
          {
            id: "p1",
            latest_stage: { status: "failure" },
            deployment_trigger: { metadata: { branch: "preview" } },
          },
        ],
        "pages",
      )[0],
    ).toMatchObject({ status: "failure", label: "preview" });
    expect(() => normalizeDeployments({ changed: [] }, "builds")).toThrow();
    expect(() => normalizeDeployments([{}], "pages")).toThrow();
  });
  it("retains paginated Worker log cursors and Pages timestamps", () => {
    expect(
      normalizeBuildLog(
        {
          result: {
            lines: [[123, "Build failed"]],
            truncated: true,
            cursor: "next",
          },
        },
        false,
      ),
    ).toEqual({ text: "123  Build failed", truncated: true, cursor: "next" });
    expect(
      normalizeBuildLog({ lines: [], truncated: false, cursor: "end" }, false)
        .cursor,
    ).toBeUndefined();
    expect(
      normalizeBuildLog(
        { data: [{ ts: "2026-10-01", line: "Building" }], total: 2 },
        true,
      ),
    ).toEqual({ text: "2026-10-01  Building", truncated: true });
    expect(() => normalizeBuildLog({ unknown: [] }, false)).toThrow();
  });
});
describe("read-only deployment requests", () => {
  it("uses Pages endpoints for Pages projects in the Workers list", async () => {
    await loadDeployments({ ...worker, product: "Pages" }, context, false, 2);
    expect(prepare).toHaveBeenCalledWith({
      context,
      path: ["pages", "deployments", "list"],
      parameters: { project_name: "api", page: 2, per_page: 20 },
    });
  });
  it("uses the Worker tag, recovering omitted cache metadata", async () => {
    vi.mocked(loadResources).mockResolvedValue([worker]);
    await loadDeployments({ ...worker, metadata: undefined }, context, true, 1);
    expect(prepare).toHaveBeenCalledWith({
      context,
      path: ["builds", "list"],
      parameters: { external_script_id: "worker-tag", page: 1, per_page: 20 },
    });
  });
  it("finds builds for each deployed version and passes cursors to log requests", async () => {
    vi.mocked(runPlan).mockResolvedValueOnce({
      success: true,
      data: { builds: [{ build_uuid: "b1" }] },
    } as Execution);
    await buildsForDeployment(
      {
        id: "d1",
        versions: ["v1", "v2"],
        label: "Deploy",
        status: "Deployed",
        created: "",
      },
      context,
    );
    expect(prepare).toHaveBeenLastCalledWith({
      context,
      path: ["builds", "versions", "get"],
      parameters: { version_ids: "v1,v2" },
    });
    vi.mocked(runPlan).mockResolvedValueOnce({
      success: true,
      data: { lines: [] },
    } as unknown as Execution);
    await loadBuildLog(worker, context, "b1", "next");
    expect(prepare).toHaveBeenLastCalledWith({
      context,
      path: ["builds", "logs", "get"],
      parameters: { build_uuid: "b1", cursor: "next" },
    });
  });
  it("does not run mutations and surfaces read failures", async () => {
    vi.mocked(prepare).mockResolvedValueOnce({
      classification: "Modify",
    } as Plan);
    await expect(
      readDeploymentData(context, ["builds", "list"], {}),
    ).rejects.toThrow("read operations");
    expect(runPlan).not.toHaveBeenCalled();
    vi.mocked(runPlan).mockResolvedValueOnce({
      success: false,
      error: "Permission denied",
    } as Execution);
    await expect(
      readDeploymentData(context, ["builds", "list"], {}),
    ).rejects.toThrow("Permission denied");
  });
});
