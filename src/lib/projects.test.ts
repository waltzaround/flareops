import { describe, expect, it, beforeEach } from "vitest";
import { inferProjectBrief, projectsInScope, useProjects } from "./projects";

const scope = { mode: "demo", accountId: "account-a", profile: "first" };
beforeEach(() => useProjects.setState({ projects: [] }));
describe("project scope", () => {
  it("keeps project briefs separate by account, login profile, and mode", () => {
    useProjects.getState().createProject(scope, "Build an app");
    const projects = useProjects.getState().projects;
    expect(projectsInScope(projects, scope)).toHaveLength(1);
    for (const other of [
      { ...scope, accountId: "account-b" },
      { ...scope, profile: "second" },
      { ...scope, mode: "live" },
    ]) {
      expect(projectsInScope(projects, other)).toHaveLength(0);
      useProjects.getState().addPrompt(projects[0].id, other, "Wrong context");
    }
    expect(useProjects.getState().projects[0].prompts).toHaveLength(1);
  });
  it("retains the brief when a follow-up is added", () => {
    const id = useProjects.getState().createProject(scope, "First brief");
    useProjects.getState().addPrompt(id, scope, "Add a health endpoint");
    expect(
      useProjects.getState().projects[0].prompts.map((p) => p.text),
    ).toEqual(["First brief", "Add a health endpoint"]);
  });
});

describe("project inference", () => {
  it("derives a name and type from the initial prompt", () => {
    expect(
      inferProjectBrief("Build a weather API with hourly forecasts"),
    ).toEqual({ name: "Weather API", template: "API" });
    expect(
      inferProjectBrief("Create a dashboard that tracks spending"),
    ).toEqual({ name: "Dashboard", template: "Web app" });
    expect(
      inferProjectBrief('Build a scheduled bot called "Daily Digest"'),
    ).toEqual({ name: "Daily Digest", template: "Automation" });
  });
  it("rejects empty project creation", () => {
    expect(() => useProjects.getState().createProject(scope, "  ")).toThrow();
    expect(useProjects.getState().projects).toHaveLength(0);
  });
});
