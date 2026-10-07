import { managementPage } from "./navigation";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Account, Page, Resource } from "./types";
import { demoAccounts } from "./demo";
export const isDesktop =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
type UIState = {
  pinnedPages: Page[];
  togglePinnedPage: (page: Page) => void;
  sidebarGroups: Record<string, boolean>;
  setSidebarGroup: (label: string, collapsed: boolean) => void;
  settingsTab: string;
  setSettingsTab: (tab: string) => void;
  forgetProfile: (profile: string) => void;
  knownAccounts: Account[];
  rememberAccounts: (v: Account[]) => void;
  theme: "system" | "dark" | "light";
  mode: "demo" | "live";
  account: Account;
  page: Page;
  sidebarOverride: "Home" | null;
  palette: boolean;
  drawer: boolean;
  zone: string;
  favorites: string[];
  recent: Resource[];
  recentAnalytics: Page[];
  defaultPage: Page;
  workspaceLabel: string;
  setTheme: (v: UIState["theme"]) => void;
  setMode: (v: UIState["mode"]) => void;
  setAccount: (v: Account) => void;
  navigate: (v: Page, sidebar?: "Home") => void;
  setPalette: (v: boolean) => void;
  setDrawer: (v: boolean) => void;
  setZone: (v: string) => void;
  toggleFavorite: (v: string) => void;
  visit: (r: Resource) => void;
  setDefaultPage: (v: Page) => void;
  setWorkspaceLabel: (v: string) => void;
};
export const useUI = create<UIState>()(
  persist(
    (set) => ({
      pinnedPages: ["Workers", "Durable Objects", "DNS"],
      togglePinnedPage: (page) =>
        set((s) => ({
          pinnedPages: s.pinnedPages.includes(page)
            ? s.pinnedPages.filter((p) => p !== page)
            : [...s.pinnedPages, page],
        })),
      sidebarGroups: {},
      setSidebarGroup: (label, collapsed) =>
        set((s) => ({
          sidebarGroups: { ...s.sidebarGroups, [label]: collapsed },
        })),
      settingsTab: "Accounts",
      setSettingsTab: (settingsTab) => set({ settingsTab }),
      forgetProfile: (profile) =>
        set((s) => ({
          knownAccounts: s.knownAccounts.filter((a) => a.profile !== profile),
          ...(s.mode === "live" && s.account.profile === profile
            ? {
                account: {
                  id: "",
                  name: "No account selected",
                  profile: "default",
                  workspace: "My workspace",
                  color: "#b8c8ad",
                },
                zone: "",
                recent: [],
                recentAnalytics: [],
              }
            : {}),
        })),
      knownAccounts: [],
      rememberAccounts: (accounts) =>
        set((s) => ({
          knownAccounts: [
            ...s.knownAccounts.filter(
              (a) =>
                !accounts.some((n) => n.id === a.id && n.profile === a.profile),
            ),
            ...accounts,
          ],
        })),
      theme: "dark",
      mode: isDesktop ? "live" : "demo",
      account: isDesktop
        ? {
            id: "",
            name: "No account selected",
            profile: "default",
            workspace: "My workspace",
            color: "#b8c8ad",
          }
        : demoAccounts[0],
      page: "Home",
      sidebarOverride: null,
      palette: false,
      drawer: false,
      zone: "z1",
      favorites: ["w1", "z1", "db1"],
      recent: [],
      recentAnalytics: [],
      defaultPage: "Home",
      workspaceLabel: "",
      setTheme: (theme) => set({ theme }),
      setMode: (mode) =>
        set({
          mode,
          account:
            mode === "demo"
              ? demoAccounts[0]
              : {
                  id: "",
                  name: "No account selected",
                  profile: "default",
                  workspace: "My workspace",
                  color: "#b8c8ad",
                },
          zone: mode === "demo" ? "z1" : "",
          recent: [],
          recentAnalytics: [],
        }),
      setAccount: (account) =>
        set({
          account,
          zone: account.id === "demo-studio-prod" ? "z1" : "",
          recent: [],
          recentAnalytics: [],
        }),
      navigate: (page, sidebar) =>
        set((s) => ({
          page: managementPage(page),
          sidebarOverride: sidebar ?? null,
          recentAnalytics: [
            "Account analytics",
            "Web analytics",
            "Worker traffic",
            "Command analytics",
            "Cron triggers",
            "Log Explorer",
            "Rule simulator",
            "Logpush",
            "Activity",
          ].includes(page)
            ? [page, ...s.recentAnalytics.filter((p) => p !== page)].slice(0, 6)
            : s.recentAnalytics,
        })),
      setPalette: (palette) => set({ palette }),
      setDrawer: (drawer) => set({ drawer }),
      setZone: (zone) => set({ zone }),
      toggleFavorite: (v) =>
        set((s) => ({
          favorites: s.favorites.includes(v)
            ? s.favorites.filter((f) => f !== v)
            : [...s.favorites, v],
        })),
      visit: (r) =>
        set((s) => ({
          recent: [r, ...s.recent.filter((v) => v.id !== r.id)].slice(0, 12),
        })),
      setDefaultPage: (defaultPage) =>
        set({ defaultPage: managementPage(defaultPage) }),
      setWorkspaceLabel: (workspaceLabel) => set({ workspaceLabel }),
    }),
    {
      // Keep the existing storage key so saved preferences survive the rename.
      name: "boxflare-ui-v1",
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.defaultPage = managementPage(state.defaultPage);
          state.pinnedPages = state.pinnedPages.filter(
            (page) => page !== "Projects" && page !== "Cloudflare",
          );
        }
      },
      partialize: (s) => ({
        pinnedPages: s.pinnedPages,
        sidebarGroups: s.sidebarGroups,
        knownAccounts: s.knownAccounts,
        theme: s.theme,
        mode: s.mode,
        account: s.account,
        zone: s.zone,
        favorites: s.favorites,
        defaultPage: s.defaultPage,
        workspaceLabel: s.workspaceLabel,
      }),
    },
  ),
);
