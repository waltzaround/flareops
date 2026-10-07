import { describe, expect, it } from "vitest";
import { githubRepository, useOnboarding } from "./onboarding";
import { useProjects } from "./projects";
describe("onboarding", () => {
  it("normalizes repository URLs and refuses credentials and non-GitHub hosts", () => {
    expect(githubRepository("https://github.com/owner/repo.git/")).toBe(
      "https://github.com/owner/repo",
    );
    for (const url of [
      "http://github.com/a/b",
      "https://github.com.evil.com/a/b",
      "https://token@github.com/a/b",
      "https://github.com/a/b?token=secret",
      "https://github.com/a/b/tree/main",
    ])
      expect(() => githubRepository(url)).toThrow();
  });
  it("keeps unfinished drafts when setup is dismissed", () => {
    useOnboarding.getState().setDraft({ prompt: "Build an API" });
    useOnboarding.getState().finish();
    useOnboarding.getState().show();
    expect(useOnboarding.getState().draft.prompt).toBe("Build an API");
    expect(useOnboarding.getState().step).toBe(0);
  });
  it("saves imports as pending and preserves their account and profile", () => {
    useProjects.setState({ projects: [] });
    const scope = { mode: "live", accountId: "account", profile: "personal" };
    useProjects
      .getState()
      .queueImport(scope, "https://github.com/owner/repo.git");
    expect(useProjects.getState().projects[0]).toMatchObject({
      ...scope,
      importSource: { url: "https://github.com/owner/repo", status: "pending" },
    });
    expect(() =>
      useProjects.getState().queueImport(scope, "https://other.com/owner/repo"),
    ).toThrow();
  });
});
