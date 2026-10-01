import { ArrowUpRight, Pin, PinOff } from "lucide-react";
import { useUI } from "../lib/store";
import { cachedResources, useResources } from "../lib/query";
import { icons, ResourceIcon } from "../components/shared";
import {
  resourceKinds,
  resourceGroups,
  resourceNames,
} from "../lib/resource-catalog";
import { resourceSchema, type Resource, type Page } from "../lib/types";

const destinations: { page: Page; description: string }[] = [
  { page: "Build", description: "Compute, storage, and workflows" },
  { page: "Media", description: "Images, video, and realtime" },
  { page: "Network", description: "Connectivity, DNS, and delivery" },
  { page: "Security", description: "Application protection and intelligence" },
  { page: "AI", description: "Models, inference, and search" },
  { page: "Workspace", description: "Analytics, logs, and investigations" },
];
export function PagePin({ page }: { page: Page }) {
  const { pinnedPages, togglePinnedPage } = useUI();
  const pinned = pinnedPages.includes(page);
  const label = `${pinned ? "Unpin" : "Pin"} ${resourceNames[page] ?? page}`;
  return (
    <button
      className="page-pin"
      aria-label={label}
      title={label}
      aria-pressed={pinned}
      onClick={() => togglePinnedPage(page)}
    >
      {pinned ? <PinOff size={15} /> : <Pin size={15} />}
    </button>
  );
}
function PinnedPages({ manage = false }: { manage?: boolean }) {
  const { pinnedPages, navigate, togglePinnedPage, page: activePage } = useUI();
  return (
    <section className="pinned-pages">
      <h2>Pinned shortcuts</h2>
      {pinnedPages.map((page) => {
        const Icon = icons[page];
        const label = resourceNames[page] ?? page;
        return (
          <div className="pinned-page-row" key={page}>
            <button
              className={`sidebar-recent ${activePage === page ? "active" : ""}`}
              aria-current={activePage === page ? "page" : undefined}
              onClick={() => navigate(page, "Home")}
            >
              {Icon && <Icon size={16} />}
              <span>{label}</span>
            </button>
            <button
              className="page-pin shortcut-remove"
              aria-label={`Remove ${label} from pinned shortcuts`}
              title="Remove shortcut"
              onClick={() => togglePinnedPage(page)}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path d="m4 4 8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        );
      })}
      {!pinnedPages.length && (
        <p className="sidebar-empty">
          Pin shortcuts from a section overview or manage them below.
        </p>
      )}
      {manage && (
        <details className="pin-manager">
          <summary>Manage pinned shortcuts</summary>
          {resourceGroups.map((group) => (
            <section key={group.label}>
              <h3>{group.label}</h3>
              {group.kinds.map((page) => (
                <div className="pinned-page-row" key={page}>
                  <span>{resourceNames[page] ?? page}</span>
                  <PagePin page={page} />
                </div>
              ))}
            </section>
          ))}
        </details>
      )}
    </section>
  );
}
function useHomeItems() {
  const { mode, account, favorites, recent } = useUI();
  const workers = useResources("Workers"),
    zones = useResources("Zones"),
    d1 = useResources("D1");
  const stored = resourceKinds.flatMap((kind) => {
    try {
      const key = JSON.stringify([
        "resources",
        mode,
        account.profile,
        account.id,
        kind,
        kind === "DNS" ? useUI.getState().zone : "",
      ]);
      const parsed = resourceSchema
        .array()
        .safeParse(JSON.parse(localStorage.getItem(key) ?? "null"));
      return parsed.success ? parsed.data : [];
    } catch {
      return [];
    }
  });
  const available = [
    ...stored,
    ...cachedResources(mode, account.profile, account.id),
    ...(workers.data ?? []),
    ...(zones.data ?? []),
    ...(d1.data ?? []),
    ...recent,
  ];
  const unique = [
    ...new Map(available.map((r) => [`${r.kind}:${r.id}`, r])).values(),
  ];
  return { recent, pinned: unique.filter((r) => favorites.includes(r.id)) };
}
export function HomeShortcuts({
  onResource,
}: {
  onResource: (r: Resource) => void;
}) {
  const { pinned, recent } = useHomeItems();
  return (
    <div className="home-shortcuts">
      <PinnedPages />
      {[
        {
          title: "Pinned resources",
          items: pinned,
          empty: "Pin resources from product lists to keep them here.",
        },
        {
          title: "Recently opened",
          items: recent,
          empty: "Resources you open appear here.",
        },
      ].map(({ title, items, empty }) => (
        <section key={title}>
          <h2>{title}</h2>
          {items.length ? (
            items.slice(0, 6).map((r) => (
              <button
                className="sidebar-recent"
                key={`${r.kind}:${r.id}`}
                onClick={() => onResource(r)}
                title={r.name}
              >
                <ResourceIcon kind={r.kind} small />
                <span>{r.name}</span>
              </button>
            ))
          ) : (
            <p className="sidebar-empty">{empty}</p>
          )}
        </section>
      ))}
    </div>
  );
}
export function Home({ onResource }: { onResource: (r: Resource) => void }) {
  const { account, navigate } = useUI();
  const { pinned, recent } = useHomeItems();
  return (
    <div className="page-content account-overview">
      <div className="overview-intro">
        <h1>{account.id ? account.name : "Your Cloudflare workspace"}</h1>
        {!account.id && <p>Connect a Cloudflare account in Settings.</p>}
      </div>
      <PinnedPages manage />
      <section className="overview-section">
        <div className="overview-section-heading">
          <h2>Your workspace</h2>
        </div>
        <div className="ai-service-grid">
          {destinations.map(({ page, description }) => (
            <button key={page} onClick={() => navigate(page)}>
              <span>
                <strong>{page}</strong>
                <small>{description}</small>
              </span>
              <ArrowUpRight size={17} />
            </button>
          ))}
        </div>
      </section>
      {[
        {
          title: "Pinned resources",
          items: pinned,
          empty: "Pin resources from product lists to keep them here.",
        },
        {
          title: "Recently opened",
          items: recent,
          empty: "Resources you open appear here.",
        },
      ].map(({ title, items, empty }) => (
        <section className="overview-section" key={title}>
          <div className="overview-section-heading">
            <h2>{title}</h2>
          </div>
          {items.length ? (
            <div className="overview-recents">
              {items.slice(0, 6).map((r) => (
                <button key={`${r.kind}:${r.id}`} onClick={() => onResource(r)}>
                  <ResourceIcon kind={r.kind} small />
                  <span>
                    <strong>{r.name}</strong>
                    <small>{r.kind}</small>
                  </span>
                  <ArrowUpRight size={15} />
                </button>
              ))}
            </div>
          ) : (
            <p className="overview-empty">{empty}</p>
          )}
        </section>
      ))}
    </div>
  );
}
