import { githubRepository } from "./onboarding";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  defaultProvider,
  providerSnapshot,
  type ProviderConfig,
} from "./providers";

export type ProjectScope = { mode: string; accountId: string; profile: string };
export type ProjectBrief = ProjectScope & {
  id: string;
  name: string;
  template: string;
  importSource?: { url: string; status: "pending" | "imported" };
  createdAt: string;
  prompts: {
    id: string;
    text: string;
    createdAt: string;
    provider?: ProviderConfig;
  }[];
};
export const projectsInScope = (
  projects: ProjectBrief[],
  scope: ProjectScope,
) =>
  projects.filter(
    (p) =>
      p.mode === scope.mode &&
      p.accountId === scope.accountId &&
      p.profile === scope.profile,
  );

// Immediate, offline metadata. The connected agent can refine it from the conversation.
export function inferProjectBrief(prompt: string) {
  const clean = prompt.trim().replace(/\s+/g, " ");
  const template =
    /\b(?:website|web app|dashboard|frontend|landing page|portfolio)\b/i.test(
      clean,
    )
      ? "Web app"
      : /\b(?:api|endpoint|backend|rest|graphql)\b/i.test(clean)
        ? "API"
        : /\b(?:cron|scheduled|automation|automate|workflow|bot)\b/i.test(clean)
          ? "Automation"
          : "Web app";
  const explicit = clean.match(
    /\b(?:called|named)\s+["“']([^"”']{1,80})["”']/i,
  )?.[1];
  const subject = clean
    .replace(
      /^(?:(?:please|can you|could you|i want to|i'd like to|help me)\s+)*(?:build|create|make|develop|design)\s+(?:(?:me|us)\s+)?(?:(?:a|an|the)\s+)?/i,
      "",
    )
    .split(/[.!?\n]|\s+(?:that|which|with)\s+/)[0]
    .trim();
  const title = explicit || subject || "New project";
  const short = title.slice(0, 70);
  return {
    name:
      short.charAt(0).toUpperCase() +
      short.slice(1) +
      (title.length > 70 ? "…" : ""),
    template,
  };
}

export const useProjects = create<{
  projects: ProjectBrief[];
  createProject: (
    scope: ProjectScope,
    prompt: string,
    provider?: ProviderConfig,
  ) => string;
  markImported: (id: string, scope: ProjectScope) => void;
  queueImport: (
    scope: ProjectScope,
    url: string,
    provider?: ProviderConfig,
  ) => string;
  addPrompt: (
    id: string,
    scope: ProjectScope,
    text: string,
    provider?: ProviderConfig,
  ) => void;
}>()(
  persist(
    (set) => ({
      projects: [],
      createProject: (scope, prompt, provider = defaultProvider) => {
        if (!prompt.trim()) throw new Error("Describe your project first.");
        const { name, template } = inferProjectBrief(prompt);
        const id = crypto.randomUUID();
        const createdAt = new Date().toISOString();
        set((state) => ({
          projects: [
            {
              ...scope,
              id,
              name,
              template,
              createdAt,
              prompts: [
                {
                  id: crypto.randomUUID(),
                  text: prompt.trim(),
                  createdAt,
                  provider: providerSnapshot(provider),
                },
              ],
            },
            ...state.projects,
          ],
        }));
        return id;
      },
      markImported: (id, scope) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id && projectsInScope([p], scope).length && p.importSource
              ? {
                  ...p,
                  importSource: { ...p.importSource, status: "imported" },
                }
              : p,
          ),
        })),
      queueImport: (scope, url, provider = defaultProvider) => {
        url = githubRepository(url);
        const id = crypto.randomUUID();
        const createdAt = new Date().toISOString();
        set((state) => ({
          projects: [
            {
              ...scope,
              id,
              name: url.split("/").pop() || "GitHub project",
              template: "GitHub repository",
              createdAt,
              importSource: { url, status: "pending" },
              prompts: [
                {
                  id: crypto.randomUUID(),
                  text: `Import ${url}`,
                  createdAt,
                  provider: providerSnapshot(provider),
                },
              ],
            },
            ...state.projects,
          ],
        }));
        return id;
      },
      addPrompt: (id, scope, text, provider = defaultProvider) => {
        if (!text.trim()) return;
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id && projectsInScope([p], scope).length
              ? {
                  ...p,
                  prompts: [
                    ...p.prompts,
                    {
                      id: crypto.randomUUID(),
                      text: text.trim(),
                      provider: providerSnapshot(provider),
                      createdAt: new Date().toISOString(),
                    },
                  ],
                }
              : p,
          ),
        }));
      },
    }),
    { name: "flareops-project-briefs", version: 1 },
  ),
);
