import {
  areaForPage,
  groupsForArea,
  productAreas,
  type ProductArea,
} from "../lib/navigation";
import { AreaOverview } from "../features/area-overview";
import {
  cloudflareAreaIcons,
  DashboardCaret,
  cloudflareIcon,
  cloudflareGroupIcons,
} from "../components/cloudflare-icons";
import { accountSettings } from "../lib/account-settings";
import { Product } from "../features/products";
import { productPages, type ProductPage } from "../lib/products";
import { AI } from "../features/ai";
import { aiChildren, aiPages, type AIPage } from "../lib/ai";
import { useEffect, useState } from "react";
import {
  Network,
  Activity,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Command,
  Plus,
  RefreshCw,
  Search,
  Terminal,
  SquarePen,
  PanelLeft,
  SlidersHorizontal,
} from "lucide-react";
import { useUI, isDesktop } from "../lib/store";
import { demoAccounts, demoResources } from "../lib/demo";
import { queryClient, useHistory } from "../lib/query";
import { icons, Kbd } from "../components/shared";
import { Button } from "../components/ui/button";
import { Home, HomeShortcuts } from "../features/home";
import { Resources, ResourceDetail } from "../features/resources";
import { DnsSheet } from "../features/dns-sheet";
import { CommandReview } from "../features/command-review";
import { Palette } from "../features/palette";
import { Explorer } from "../features/explorer";
import { CronTriggers } from "../features/crons";
import { Investigate, investigationPages } from "../features/investigate";
import type { InvestigationPage } from "../lib/investigate";
import { SiteAnalytics } from "../features/site-analytics";
import { Analytics } from "../features/analytics";
import { ActivityView } from "../features/activity";
import { Settings } from "../features/settings";
import type { Page, Resource, Request, Discovery } from "../lib/types";
import {
  resourceGroups,
  resourceKinds,
  resourceNames,
} from "../lib/resource-catalog";
import { diagnostics } from "../lib/cf";
export default function App() {
  const {
    theme,
    mode,
    account,
    setAccount,
    page,
    sidebarOverride,
    navigate,
    palette,
    setPalette,
    drawer,
    setDrawer,
    visit,
    defaultPage,
    knownAccounts,
    settingsTab,
    setSettingsTab,
    recent,
    recentAnalytics,
    sidebarGroups: sections,
    setSidebarGroup,
  } = useUI();
  const [switcher, setSwitcher] = useState(false),
    [collapsed, setCollapsed] = useState(() => window.innerWidth < 760),
    [dnsOpen, setDnsOpen] = useState(false),
    [dnsRecord, setDnsRecord] = useState<Resource>(),
    [detail, setDetail] = useState<Resource | null>(null),
    [review, setReview] = useState<Request | null>(null),
    [discovery, setDiscovery] = useState<Discovery | null>(null),
    [cliVersion, setCliVersion] = useState<string>();
  const { data: history = [] } = useHistory();
  const area = sidebarOverride ?? areaForPage(page);
  useEffect(() => {
    const activeGroup = resourceGroups.find((group) =>
      group.kinds.includes(page),
    );
    if (activeGroup) setSidebarGroup(activeGroup.label, false);
  }, [page, setSidebarGroup]);
  useEffect(() => {
    navigate(defaultPage);
    if (isDesktop)
      diagnostics()
        .then((d) => {
          setCliVersion(d.version);
          if (!account.id) navigate("Settings");
        })
        .catch(() => {});
  }, []);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      (document.documentElement.dataset.theme =
        theme === "system" ? (mq.matches ? "dark" : "light") : theme);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey) {
        if (e.key.toLowerCase() === "k" && !e.altKey && !e.repeat) {
          e.preventDefault();
          setPalette(!useUI.getState().palette);
        }
        if (e.key === ",") {
          e.preventDefault();
          navigate("Settings");
        }
        if (e.key === "r") {
          e.preventDefault();
          void queryClient.invalidateQueries({ queryKey: ["resources"] });
        }
      }
      if (e.key === "Escape") setSwitcher(false);
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    setDetail(null);
    setDnsOpen(false);
    setSwitcher(false);
  }, [account.id, account.profile]);
  function openResource(r: Resource) {
    visit(r);
    if (r.kind === "DNS") {
      setDnsRecord(r);
      setDnsOpen(true);
    } else setDetail(r);
  }
  function command(d: Discovery) {
    setDiscovery(d);
    navigate("Explorer");
  }
  function dns(r?: Resource) {
    setDnsRecord(r);
    setDnsOpen(true);
  }
  const nav = (p: Page, label: string = p) => {
    const Icon = icons[p] ?? cloudflareAreaIcons.Build;
    return (
      <button
        key={`page:${p}`}
        aria-label={label}
        title={label}
        className={`nav-item ${page === p ? "active" : ""}`}
        onClick={() => navigate(p)}
      >
        <Icon className="nav-item-icon" size={17} />
        {!collapsed && (
          <>
            <span>{label}</span>
            {p === "Explorer" && <span className="nav-new">↗</span>}
          </>
        )}
      </button>
    );
  };
  const group = (label: string, children: React.ReactNode) => {
    const GroupIcon = cloudflareGroupIcons[label];
    const groupCollapsed =
      sections[label] ?? resourceGroups.some((group) => group.label === label);
    return (
      <div className="nav-group" key={`group:${label}`}>
        <button
          className="nav-group-title"
          aria-label={label}
          aria-expanded={!groupCollapsed}
          aria-controls={`nav-group-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
          onClick={() => setSidebarGroup(label, !groupCollapsed)}
        >
          {!collapsed && (
            <>
              {GroupIcon && <GroupIcon size={16} className="nav-group-icon" />}
              <span>{label}</span>
              <DashboardCaret
                size={12}
                className={`nav-group-caret ${groupCollapsed ? "" : "is-open"}`}
              />
            </>
          )}
        </button>
        <div
          id={`nav-group-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
          hidden={groupCollapsed}
        >
          {children}
        </div>
      </div>
    );
  };
  const aiActive = aiPages.includes(page as AIPage);
  const workspaceActive = [
    "Workspace",
    "Explorer",
    "Account analytics",
    "Web analytics",
    "Worker traffic",
    "Command analytics",
    ...investigationPages,
    "Cron triggers",
    "Activity",
  ].includes(page);
  const sidebarRecent = recent.length
    ? recent
    : mode === "demo" && account.id === "demo-studio-prod"
      ? demoResources.filter((r) => ["w1", "z1", "db1"].includes(r.id))
      : [];
  return (
    <div
      className={`app-shell workspace-shell ${collapsed ? "sidebar-collapsed" : ""}`}
    >
      <nav className="app-rail" aria-label="Workspace navigation">
        <button
          className={`rail-button ${area === "Home" ? "active" : ""}`}
          title="Home"
          aria-label="Workspace home"
          onClick={() => navigate("Home")}
        >
          <cloudflareAreaIcons.Home size={21} />
        </button>
        {(
          [
            ["Build", cloudflareAreaIcons.Build],
            ["Media", cloudflareAreaIcons.Media],
            ["Network", cloudflareAreaIcons.Network],
            ["Security", cloudflareAreaIcons.Security],
          ] as const
        ).map(([section, Icon]) => (
          <button
            key={section}
            className={`rail-button ${area === section ? "active" : ""}`}
            title={section}
            aria-label={`Open ${section}`}
            aria-current={area === section ? "page" : undefined}
            onClick={() => navigate(section)}
          >
            <Icon size={21} />
          </button>
        ))}
        <button
          className={`rail-button ${area === "Workspace" ? "active" : ""}`}
          title="Workspace"
          aria-label="Open workspace"
          onClick={() => navigate("Workspace")}
        >
          <cloudflareAreaIcons.Workspace size={21} />
        </button>
        <button
          className={`rail-button ${area === "AI" ? "active" : ""}`}
          title="AI"
          aria-label="Open AI"
          onClick={() => navigate("AI")}
        >
          <cloudflareAreaIcons.AI size={21} />
        </button>
        <button
          className={`rail-button ${area === "Settings" ? "active" : ""}`}
          title="Settings"
          aria-label="Settings"
          onClick={() => navigate("Settings")}
        >
          <cloudflareAreaIcons.Settings size={20} />
        </button>
        <div className="rail-spacer" />
        <button
          className={`rail-button ${palette ? "active" : ""}`}
          title="Search (⌘K / Ctrl+K)"
          aria-keyshortcuts="Meta+k Control+k"
          aria-label="Search anything"
          onClick={() => setPalette(true)}
        >
          <Search size={21} />
        </button>
        <button
          className="rail-button"
          title={collapsed ? "Show sidebar" : "Hide sidebar"}
          aria-label="Toggle sidebar"
          onClick={() => setCollapsed(!collapsed)}
        >
          <PanelLeft size={20} />
        </button>
        <button
          className="rail-profile"
          style={{ background: account.color }}
          title={`Profile: ${account.profile}`}
          aria-label="Manage profile"
          onClick={() => navigate("Settings")}
        >
          {account.profile.slice(0, 2).toUpperCase()}
        </button>
      </nav>
      <aside
        className="sidebar workspace-sidebar"
        aria-label="Cloudflare workspace"
      >
        <div className="context-wrap">
          <button
            className={`context-switcher ${switcher ? "open" : ""}`}
            onClick={() => setSwitcher(!switcher)}
            aria-expanded={switcher}
            aria-label="Switch account"
          >
            <span>
              <strong>{account.name}</strong>
            </span>
            <ChevronsUpDown size={14} />
          </button>
          {switcher && (
            <>
              <div
                className="dismiss-layer"
                onClick={() => setSwitcher(false)}
              />
              <div className="context-menu">
                <div className="section-label">Switch account</div>
                {(mode === "demo"
                  ? demoAccounts
                  : knownAccounts.length
                    ? knownAccounts
                    : [account]
                ).map((a) => (
                  <button
                    className="account-option"
                    key={a.profile + a.id}
                    onClick={() => {
                      setAccount(a);
                      setSwitcher(false);
                    }}
                  >
                    <span
                      className="avatar-mini"
                      style={{ background: a.color }}
                    >
                      {a.workspace[0]}
                    </span>
                    <span>
                      <strong>{a.name}</strong>
                      <small>
                        {a.workspace} / {a.profile}
                      </small>
                    </span>
                    {account.id === a.id && account.profile === a.profile && (
                      <Check size={15} />
                    )}
                  </button>
                ))}
                <button
                  className="add-account"
                  onClick={() => {
                    setSettingsTab("Accounts");
                    navigate("Settings");
                    setSwitcher(false);
                  }}
                >
                  <Plus size={16} />
                  Add or manage accounts
                </button>
              </div>
            </>
          )}
        </div>
        {area === "Workspace" && (
          <button className="new-command" onClick={() => setPalette(true)}>
            <SquarePen size={18} />
            <span>New command</span>
            <Kbd>⌘ K</Kbd>
          </button>
        )}
        <nav
          key={area}
          className="main-nav"
          aria-label={
            area === "AI"
              ? "AI navigation"
              : area === "Settings"
                ? "Settings navigation"
                : area === "Workspace"
                  ? "Workspace analytics and logs"
                  : `${area} navigation`
          }
        >
          {area === "AI" ? (
            <>
              {nav("AI", "Overview")}
              {group(
                "AI",
                <div className="ai-sidebar-children">
                  {aiChildren.map((p) => nav(p))}
                </div>,
              )}
            </>
          ) : area === "Settings" ? (
            <>
              {!collapsed && <div className="section-label">Settings</div>}
              {[
                { label: "General", Icon: cloudflareIcon("gear") },
                { label: "Cloudflare CLI", Icon: cloudflareIcon("wrangler") },
                { label: "Accounts", Icon: cloudflareIcon("user-multi") },
                {
                  label: "Workspaces",
                  Icon: cloudflareIcon("organization-outline"),
                },
                { label: "Advanced", Icon: cloudflareIcon("wrench") },
              ].map(({ label, Icon }) => (
                <button
                  key={label}
                  className={`nav-item ${settingsTab === label ? "active" : ""}`}
                  aria-label={label}
                  aria-current={settingsTab === label ? "page" : undefined}
                  title={label}
                  onClick={() => setSettingsTab(label)}
                >
                  <Icon className="nav-item-icon" size={17} />
                  {!collapsed && <span>{label}</span>}
                </button>
              ))}
              {group(
                "Manage account",
                <>
                  {accountSettings.map((setting) => {
                    return (
                      <button
                        key={setting.label}
                        className={`nav-item ${settingsTab === setting.label ? "active" : ""}`}
                        aria-label={setting.label}
                        aria-current={
                          settingsTab === setting.label ? "page" : undefined
                        }
                        title={collapsed ? setting.label : undefined}
                        onClick={() => setSettingsTab(setting.label)}
                      >
                        {!collapsed && <span>{setting.label}</span>}
                        {!collapsed && "beta" in setting && (
                          <small className="account-beta">Beta</small>
                        )}
                      </button>
                    );
                  })}
                </>,
              )}
            </>
          ) : area === "Workspace" ? (
            <>
              {group(
                "Workspace",
                <>
                  {nav("Workspace", "Overview")}
                  {nav("Explorer", "Cloudflare Explorer")}
                </>,
              )}
              {group(
                "Analytics & logs",
                <>
                  {nav("Account analytics")}
                  {nav("Web analytics")}
                  {nav("Worker traffic")}
                  {nav("Command analytics")}
                  {nav("Activity", "Command logs")}
                  {nav("Cron triggers")}
                </>,
              )}
              {group(
                "Investigate",
                <>{investigationPages.map((p) => nav(p))}</>,
              )}
              {group(
                "Recent analytics",
                <>
                  {recentAnalytics.length ? (
                    recentAnalytics.map((p) =>
                      nav(p, p === "Activity" ? "Command logs" : p),
                    )
                  ) : (
                    <p className="sidebar-empty">
                      Analytics you view appear here.
                    </p>
                  )}
                </>,
              )}
            </>
          ) : area === "Home" ? (
            <>
              {nav("Home", "Overview")}
              <HomeShortcuts onResource={openResource} />
            </>
          ) : (
            <>
              {nav(area as Page, "Overview")}
              {groupsForArea(area).map(({ label, kinds }) =>
                group(label, <>{kinds.map((p) => nav(p, resourceNames[p]))}</>),
              )}
            </>
          )}
        </nav>
        <button
          className="sidebar-connection"
          onClick={() => navigate("Settings")}
        >
          <span
            className={`cli-dot ${mode === "live" && !cliVersion ? "offline" : ""}`}
          />
          <span>
            {mode === "demo"
              ? "Demo workspace"
              : cliVersion
                ? `cf ${cliVersion}`
                : "Connect Cloudflare"}
          </span>
          <ChevronRight size={13} />
        </button>
      </aside>
      <main className="main">
        <header className="topbar workspace-topbar">
          <div className="workspace-title">
            <strong>
              {page === "Home"
                ? "Account overview"
                : page === "Explorer"
                  ? "Cloudflare Explorer"
                  : page === "Activity"
                    ? "Command logs"
                    : page}
            </strong>
            <span>{account.name}</span>
          </div>
          <div className="topbar-actions">
            <div id="page-header-actions" className="page-header-actions" />
            {mode === "demo" && <span className="demo-label">Demo</span>}
            <button
              title="Refresh workspace"
              aria-label="Refresh workspace"
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: ["resources"] })
              }
            >
              <RefreshCw size={17} />
            </button>
            <button
              title="Settings"
              aria-label="Workspace settings"
              onClick={() => navigate("Settings")}
            >
              <SlidersHorizontal size={18} />
            </button>
          </div>
        </header>
        <div className="main-scroll" key={page}>
          {aiActive ? (
            <AI page={page as AIPage} />
          ) : productAreas.includes(page as ProductArea) ? (
            <AreaOverview area={page as ProductArea} />
          ) : productPages.includes(page as ProductPage) ? (
            <Product
              key={`${page}-${mode}-${account.profile}-${account.id}`}
              page={page as ProductPage}
              onCommand={command}
            />
          ) : page === "Home" ? (
            <Home onResource={openResource} />
          ) : resourceKinds.includes(page as Resource["kind"]) ? (
            <Resources
              key={`${page}-${account.id}`}
              kind={page as Resource["kind"]}
              onResource={openResource}
              onDns={dns}
              onReview={setReview}
              onCommand={command}
            />
          ) : page === "Explorer" ? (
            <Explorer initial={discovery} onReview={setReview} />
          ) : page === "Activity" ? (
            <ActivityView />
          ) : investigationPages.includes(page as InvestigationPage) ? (
            <Investigate
              key={`${page}-${mode}-${account.profile}-${account.id}`}
              page={page as InvestigationPage}
              onReview={setReview}
            />
          ) : page === "Cron triggers" ? (
            <CronTriggers />
          ) : page === "Account analytics" || page === "Web analytics" ? (
            <SiteAnalytics
              key={`${page}-${mode}-${account.profile}-${account.id}`}
              kind={page === "Account analytics" ? "account" : "web"}
            />
          ) : workspaceActive ? (
            <Analytics
              view={
                page === "Worker traffic"
                  ? "workers"
                  : page === "Command analytics"
                    ? "commands"
                    : "overview"
              }
            />
          ) : (
            <Settings />
          )}
        </div>
        {workspaceActive && (
          <div className={`activity-drawer ${drawer ? "expanded" : ""}`}>
            <button
              className="drawer-toggle"
              onClick={() => setDrawer(!drawer)}
            >
              <Terminal size={14} />
              <strong>Activity</strong>
              <span className="activity-count">{history.length}</span>
              <span className="drawer-last">
                {mode === "demo"
                  ? "Sample data · no live changes"
                  : cliVersion
                    ? `cf ${cliVersion}`
                    : "Add a Cloudflare account in Settings"}
              </span>
              {drawer ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            {drawer && <ActivityView compact />}
          </div>
        )}
      </main>
      <Palette onResource={openResource} onCommand={command} />
      <DnsSheet
        open={dnsOpen}
        record={dnsRecord}
        onClose={() => setDnsOpen(false)}
        onReview={setReview}
      />
      <ResourceDetail
        key={detail?.id}
        resource={detail}
        onClose={() => setDetail(null)}
        onCommand={command}
      />
      <CommandReview request={review} onClose={() => setReview(null)} />
    </div>
  );
}
