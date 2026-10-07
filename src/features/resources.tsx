import {
  ListToolbar,
  ListSearch,
  ListRefresh,
} from "../components/list-toolbar";
import { WorkerManagement } from "./worker-management";
import { Deployments } from "./deployments";
import { sortResources, type SortKey } from "../lib/resource-sort";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ArrowUpRight,
  ChevronRight,
  Cloud,
  CloudOff,
  Copy,
  Download,
  Filter,
  Globe2,
  MoreHorizontal,
  Pencil,
  Plus,
  Star,
  Terminal,
  Trash2,
} from "lucide-react";
import { useUI } from "../lib/store";
import { useResources, useWorkerTraffic } from "../lib/query";
import {
  ResourceIcon,
  Status,
  Empty,
  ErrorBox,
  Loading,
} from "../components/shared";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import type { Resource, Request, Discovery } from "../lib/types";
import { internalUrl } from "../lib/types";
import {
  copy,
  formatMetadataValue,
  formatTimestamp,
  relativeTime,
} from "../lib/utils";
import {
  resourceNames as names,
  resourceCommands,
} from "../lib/resource-catalog";
export function Resources({
  kind,
  onResource,
  onDns,
  onReview,
  onCommand,
}: {
  kind: Resource["kind"];
  onResource: (r: Resource) => void;
  onDns: (r?: Resource) => void;
  onReview: (r: Request) => void;
  onCommand: (d: Discovery) => void;
}) {
  const { account, zone, setZone, favorites, toggleFavorite } = useUI();
  const query = useResources(kind);
  const zones = useResources("Zones");
  const traffic = useWorkerTraffic(kind === "Workers");
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>(
    { key: "name", direction: "asc" },
  );
  function heading(key: SortKey, label: string) {
    const active = sort.key === key;
    return (
      <th
        aria-sort={
          active
            ? sort.direction === "asc"
              ? "ascending"
              : "descending"
            : "none"
        }
      >
        <button
          className="column-sort"
          onClick={() =>
            setSort({
              key,
              direction: active
                ? sort.direction === "asc"
                  ? "desc"
                  : "asc"
                : key === "traffic" || key === "modified"
                  ? "desc"
                  : "asc",
            })
          }
        >
          {label}
          {active ? (
            sort.direction === "asc" ? (
              <ArrowUp size={13} />
            ) : (
              <ArrowDown size={13} />
            )
          ) : (
            <ArrowUpDown size={13} />
          )}
        </button>
      </th>
    );
  }
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("All types");
  const rows = sortResources(
    (query.data ?? []).filter(
      (r) =>
        (r.name + " " + (r.content ?? ""))
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (filter === "All types" || r.type === filter),
    ),
    sort.key,
    sort.direction,
    traffic.data?.requests,
  );
  const dns = kind === "DNS";
  function create() {
    if (resourceCommands[kind]) {
      onCommand({
        command: "",
        fullPath: [],
        description: resourceCommands[kind]!.query,
      });
    } else if (dns) onDns();
    else
      onCommand({
        command: `cf ${kind === "D1" ? "d1 create" : kind === "R2" ? "r2 buckets create" : kind === "Workers" ? "deploy" : kind.toLowerCase() + " create"}`,
        fullPath: [],
        description: `create ${kind}`,
      });
  }
  return (
    <div className="page-content resources-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">{account.name.toUpperCase()}</div>
          <h1>{names[kind]}</h1>
        </div>
        <Button variant="default" onClick={create}>
          <Plus size={15} />
          {resourceCommands[kind]?.label ??
            (dns
              ? "Add record"
              : kind === "Workers"
                ? "Deploy Worker"
                : kind === "Zones"
                  ? "Add zone"
                  : `Create ${kind === "D1" ? "database" : kind === "R2" ? "bucket" : kind === "KV" ? "namespace" : "queue"}`)}
        </Button>
      </div>
      <ListToolbar>
        {dns && (
          <div className="zone-picker">
            <Globe2 size={16} aria-hidden="true" />
            <select
              aria-label="DNS zone"
              value={zone}
              onChange={(e) => setZone(e.target.value)}
            >
              <option value="">Select a zone</option>
              {zones.data?.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <ListSearch
          label={`Search ${names[kind]}`}
          placeholder={`Search ${names[kind].toLowerCase()}…`}
          value={search}
          onChange={setSearch}
        />
        {dns && (
          <select
            aria-label="Filter record type"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            {["All types", "A", "AAAA", "CNAME", "MX", "TXT", "NS"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        )}
        <span className="resource-total">
          {query.isError && !rows.length
            ? "Unavailable"
            : `${rows.length} ${dns ? "record" : "resource"}${rows.length === 1 ? "" : "s"}`}
        </span>
        <ListRefresh
          busy={query.isFetching}
          disabled={!account.id || (dns && !zone)}
          onRefresh={() => {
            void query.refetch();
            if (kind === "Workers") void traffic.refetch();
          }}
        />
      </ListToolbar>
      {kind === "Workers" && traffic.isError && (
        <div className="traffic-notice" role="status">
          Traffic unavailable.{" "}
          <span title={String(traffic.error)}>Check analytics access.</span>
          <button onClick={() => void traffic.refetch()}>Retry</button>
        </div>
      )}
      {query.error && (
        <ErrorBox error={query.error} retry={() => query.refetch()} />
      )}{" "}
      {query.isLoading ? (
        <Loading />
      ) : !account.id ? (
        <Empty
          title="Choose your Cloudflare account"
          description="Open Settings to discover your profiles and accounts."
        />
      ) : dns && !zone ? (
        <Empty
          title="Select a zone"
          description="Choose the domain whose DNS records you want to manage."
        />
      ) : query.isError && rows.length === 0 ? null : rows.length === 0 ? (
        <Empty
          title={search ? "No matching resources" : "Nothing here yet"}
          description={
            search
              ? "Try a different name or reset your filters."
              : `This account has no ${names[kind].toLowerCase()} in the loaded results.`
          }
          action={search ? "Clear search" : undefined}
          onAction={() => {
            setSearch("");
            setFilter("All types");
          }}
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {dns ? (
                  <>
                    {heading("type", "Type")}
                    {heading("name", "Name")}
                    {heading("content", "Content")}
                    {heading("proxied", "Proxy status")}
                    {heading("ttl", "TTL")}
                  </>
                ) : (
                  <>
                    {heading("name", "Name")}
                    {kind === "Workers" && heading("product", "Type")}
                    {heading("status", "Status")}
                    {kind === "Workers"
                      ? heading("traffic", "Requests · 24h")
                      : heading(
                          "description",
                          kind === "Zones" ? "Plan" : "Description",
                        )}
                  </>
                )}
                {heading("modified", "Modified")}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  {dns ? (
                    <>
                      <td>
                        <span className="record-type">{r.type}</span>
                      </td>
                      <td>
                        <button className="table-name" onClick={() => onDns(r)}>
                          {r.name}
                        </button>
                      </td>
                      <td>
                        <span className="record-content" title={r.content}>
                          {r.content}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`proxy-badge ${r.proxied ? "proxied" : ""}`}
                        >
                          {r.proxied ? (
                            <Cloud size={16} />
                          ) : (
                            <CloudOff size={16} />
                          )}{" "}
                          {r.proxied ? "Proxied" : "DNS only"}
                        </span>
                      </td>
                      <td className="muted">
                        {r.ttl === 1 ? "Auto" : `${r.ttl}s`}
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        <button
                          className="resource-name"
                          onClick={() => onResource(r)}
                        >
                          <ResourceIcon kind={kind} small />
                          <strong>{r.name}</strong>
                        </button>
                      </td>
                      {kind === "Workers" && (
                        <td className="muted">{r.product ?? "Worker"}</td>
                      )}
                      <td>
                        <Status label={r.status} />
                      </td>
                      {kind === "Workers" ? (
                        <td
                          className="traffic-cell"
                          title={
                            r.product === "Pages"
                              ? "Pages traffic is not included in Workers analytics."
                              : traffic.data
                                ? `${formatTimestamp(traffic.data.start)} – ${formatTimestamp(traffic.data.end)}`
                                : undefined
                          }
                        >
                          {r.product === "Pages"
                            ? "—"
                            : traffic.data
                              ? (
                                  traffic.data.requests[r.name] ?? 0
                                ).toLocaleString()
                              : traffic.isError
                                ? "Unavailable"
                                : "…"}
                        </td>
                      ) : (
                        <td className="muted">{r.description || "—"}</td>
                      )}
                    </>
                  )}
                  <td
                    className="modified-cell"
                    title={formatTimestamp(r.modified)}
                  >
                    {relativeTime(r.modified)}
                  </td>
                  <td>
                    <div className="row-actions">
                      {dns ? (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={`Edit ${r.name}`}
                            onClick={() => onDns(r)}
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={`Delete ${r.name}`}
                            onClick={() =>
                              onReview({
                                path: ["dns", "records", "delete"],
                                context: {
                                  profile: account.profile,
                                  accountId: account.id,
                                  zoneId: zone,
                                },
                                parameters: { dns_record_id: r.id },
                              })
                            }
                          >
                            <Trash2 size={14} />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={`Favorite ${r.name}`}
                            aria-pressed={favorites.includes(r.id)}
                            onClick={() => toggleFavorite(r.id)}
                          >
                            <Star
                              size={14}
                              className={
                                favorites.includes(r.id) ? "favorite" : ""
                              }
                            />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title={`Open ${r.name}`}
                            onClick={() => onResource(r)}
                          >
                            <ChevronRight size={15} />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
export function ResourceDetail({
  resource,
  onClose,
  onCommand,
}: {
  resource: Resource | null;
  onClose: () => void;
  onCommand: (d: Discovery) => void;
}) {
  const { account, setZone, navigate, toggleFavorite, favorites, mode } =
    useUI();
  const [tab, setTab] = useState("Overview"),
    [copied, setCopied] = useState(false);
  if (!resource) return null;
  const r = resource;
  const tabs =
    r.product === "Pages"
      ? ["Overview", "Deployments", "Build logs", "Domains", "Settings"]
      : r.kind === "Workers"
        ? [
            "Overview",
            "Deployments",
            "Versions",
            "Bindings",
            "Build logs",
            "Domains",
            "Settings",
          ]
        : r.kind === "Zones"
          ? ["Overview", "DNS", "Cache", "Rules", "Security"]
          : r.kind === "D1"
            ? ["Overview", "Metadata", "Backups", "Query"]
            : r.kind === "R2"
              ? ["Overview", "Objects", "Configuration"]
              : ["Overview", "Metadata"];
  return (
    <Dialog
      open={!!r}
      onOpenChange={(v) => !v && onClose()}
      title={r.name}
      description={`${r.product ?? r.kind} · ${account.name}`}
      sheet
      className="detail-sheet"
    >
      <div className="detail-banner">
        <ResourceIcon kind={r.kind} />
        <Status label={r.status} />
        <Button
          size="icon"
          variant="ghost"
          title="Favorite resource"
          onClick={() => toggleFavorite(r.id)}
        >
          <Star
            size={17}
            className={favorites.includes(r.id) ? "favorite" : ""}
          />
        </Button>
      </div>
      <div className="tabs">
        {tabs.map((t) => (
          <button
            className={tab === t ? "active" : ""}
            key={t}
            onClick={() => {
              setTab(t);
              if (t === "DNS") {
                setZone(r.id);
                navigate("DNS");
                onClose();
              }
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="dialog-body">
        {r.kind === "Workers" && (tab === "Settings" || tab === "Domains") ? (
          <WorkerManagement
            key={`${mode}-${account.profile}-${account.id}-${r.id}-${tab}`}
            resource={r}
            section={tab === "Settings" ? "settings" : "domains"}
          />
        ) : r.kind === "Workers" &&
          (tab === "Deployments" || tab === "Build logs") ? (
          <Deployments
            key={`${mode}-${account.profile}-${account.id}-${r.id}-${tab}`}
            resource={r}
            builds={tab === "Build logs"}
          />
        ) : tab === "Overview" || tab === "Metadata" || tab === "Bindings" ? (
          <>
            <p className="detail-description">
              {r.description || "Resource managed by the Cloudflare CLI."}
            </p>
            <dl className="metadata">
              <div>
                <dt>Account</dt>
                <dd>{account.name}</dd>
              </div>
              <div>
                <dt>Profile</dt>
                <dd>{account.profile}</dd>
              </div>
              <div>
                <dt>Resource ID</dt>
                <dd className="mono">
                  {r.product === "Pages"
                    ? String(r.metadata?.id ?? r.id)
                    : r.id}
                  <button
                    title="Copy resource ID"
                    onClick={() =>
                      copy(
                        r.product === "Pages"
                          ? String(r.metadata?.id ?? r.id)
                          : r.id,
                      )
                    }
                  >
                    <Copy size={13} />
                  </button>
                </dd>
              </div>
              <div>
                <dt>Modified</dt>
                <dd>{formatTimestamp(r.modified)}</dd>
              </div>
              {Object.entries(r.metadata ?? {})
                .filter(([k]) => !["id", "name", "content"].includes(k))
                .slice(0, 10)
                .map(([key, value]) => (
                  <div key={key}>
                    <dt>{key.replaceAll("_", " ")}</dt>
                    <dd>{formatMetadataValue(value)}</dd>
                  </div>
                ))}
            </dl>
          </>
        ) : (
          <div className="capability-panel">
            <Terminal size={25} />
            <h3>{tab} through Cloudflare Explorer</h3>
            <p>
              Discover the bundled CLI’s commands for this resource and inspect
              their parameters before running.
            </p>
            <Button
              onClick={() => {
                onCommand({
                  command: "",
                  fullPath: [],
                  description: `${r.product === "Pages" ? "pages" : r.kind} ${tab.toLowerCase()} ${r.name}`,
                });
                onClose();
              }}
            >
              Discover {tab.toLowerCase()}
              <ArrowUpRight size={14} />
            </Button>
          </div>
        )}
        <div className="notice">
          <Terminal size={16} />
          <span>
            {mode === "demo"
              ? "Sample resource. Switch to live mode in Settings to connect your account."
              : "Resource data comes from cf. Details reflect the most recent refresh."}
          </span>
        </div>
      </div>
      <div className="dialog-footer">
        <Button
          onClick={() => {
            copy(internalUrl(account.id, r.kind, r.id));
            setCopied(true);
          }}
        >
          <Copy size={14} />
          {copied ? "Link copied" : "Copy resource link"}
        </Button>
        <Button
          variant="default"
          onClick={() => {
            onCommand({
              command: "",
              fullPath: [],
              description: `${r.product === "Pages" ? "pages" : r.kind} ${r.name}`,
            });
            onClose();
          }}
        >
          Find actions
          <ArrowUpRight size={14} />
        </Button>
      </div>
    </Dialog>
  );
}
