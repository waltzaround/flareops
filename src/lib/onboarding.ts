import { create } from "zustand";
import { persist } from "zustand/middleware";
export function githubRepository(input: string) {
  const url = new URL(input.trim());
  const match = url.pathname
    .replace(/\/$/, "")
    .match(/^\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9._-]+?)(?:\.git)?$/);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !match
  )
    throw new Error(
      "Use a repository URL such as https://github.com/owner/repository.",
    );
  return `https://github.com/${match[1]}/${match[2]}`;
}
export const useOnboarding = create<{
  draft: { prompt: string; url: string; kind: "new" | "github" };
  setDraft: (
    draft: Partial<{ prompt: string; url: string; kind: "new" | "github" }>,
  ) => void;
  dismissed: boolean;
  open: boolean;
  step: number;
  setStep: (step: number) => void;
  show: () => void;
  finish: () => void;
}>()(
  persist(
    (set) => ({
      draft: { prompt: "", url: "", kind: "new" },
      setDraft: (draft) => set((s) => ({ draft: { ...s.draft, ...draft } })),
      dismissed: false,
      open: false,
      step: 0,
      setStep: (step) => set({ step }),
      show: () => set({ open: true, step: 0 }),
      finish: () => set({ dismissed: true, open: false, step: 0 }),
    }),
    {
      name: "flareops-onboarding",
      version: 1,
      partialize: (s) => ({ dismissed: s.dismissed, draft: s.draft }),
    },
  ),
);
