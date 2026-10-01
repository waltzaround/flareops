import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "../components/ui/button";
import { ErrorBox } from "../components/shared";
import { useUI } from "../lib/store";
import { queryClient } from "../lib/query";
import {
  readManagement,
  prepareManagement,
  applyManagement,
  type ManagementPlan,
  type ManagementRequest,
  type ManagementView,
} from "../lib/management";
import type { Resource } from "../lib/types";

function summary(value: unknown): string {
  if (value === null || value === undefined) return "Not configured";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return value.join(", ") || "None";
  return Object.entries(value)
    .map(([key, v]) => `${key.replaceAll("_", " ")}: ${summary(v)}`)
    .join("\n");
}
export function WorkerManagement({
  resource,
  section,
}: {
  resource: Resource;
  section: "settings" | "domains";
}) {
  const { account, mode } = useUI();
  const context = { profile: account.profile, accountId: account.id };
  const request: ManagementRequest = {
    product: resource.product === "Pages" ? "Pages" : "Worker",
    resource: resource.name,
    section,
  };
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [plan, setPlan] = useState<
    ManagementPlan & { context: typeof context }
  >();
  const query = useQuery({
    queryKey: [
      "management",
      mode,
      account.profile,
      account.id,
      resource.name,
      request.product,
      section,
    ],
    queryFn: () => readManagement(context, request),
    enabled: mode === "live",
    retry: false,
  });
  async function review(
    action: ManagementRequest["action"],
    values: Record<string, unknown>,
  ) {
    setBusy(true);
    setError(undefined);
    setMessage("");
    try {
      setPlan({
        ...(await prepareManagement(context, { ...request, action, values })),
        context,
      });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (!plan) return;
    setBusy(true);
    setError(undefined);
    try {
      await applyManagement(context, plan.id);
      setPlan(undefined);
      setMessage("Changes applied.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["management"] }),
        queryClient.invalidateQueries({ queryKey: ["resources"] }),
      ]);
    } catch (e) {
      setPlan(undefined);
      setError(e);
      void query.refetch();
    } finally {
      setBusy(false);
    }
  }
  const changed =
    plan &&
    (plan.context.profile !== account.profile ||
      plan.context.accountId !== account.id);
  if (mode === "demo")
    return <p>Connect an account to manage settings and domains.</p>;
  return (
    <section className="worker-management">
      <div className="deployment-heading">
        <h3>{section === "domains" ? "Custom domains" : "Settings"}</h3>
        <Button
          size="sm"
          disabled={busy || query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw size={13} />
          Refresh
        </Button>
      </div>
      {query.isPending && <p role="status">Loading…</p>}
      {(error || query.error) && <ErrorBox error={error || query.error} />}
      {message && <p role="status">{message}</p>}
      {plan ? (
        <div className="management-review">
          <h3>Review change</h3>
          <p>
            {account.name} · {plan.context.profile} · {resource.name}
          </p>
          <div className="management-comparison">
            <div>
              <h4>Current</h4>
              <pre>{summary(plan.before)}</pre>
            </div>
            <div>
              <h4>Proposed</h4>
              <pre>{summary(plan.after)}</pre>
            </div>
          </div>
          <p>{plan.warning}</p>
          {changed && (
            <p role="alert">Account changed. Review this change again.</p>
          )}
          <div className="management-actions">
            <Button disabled={busy} onClick={() => setPlan(undefined)}>
              Back
            </Button>
            <Button
              variant="default"
              disabled={busy || !!changed}
              onClick={() => void apply()}
            >
              {busy ? "Applying…" : "Apply change"}
            </Button>
          </div>
        </div>
      ) : (
        query.data &&
        (section === "settings" ? (
          <SettingsForm
            key={query.dataUpdatedAt}
            product={request.product}
            settings={query.data.settings ?? {}}
            busy={busy}
            onReview={(v) => void review("settings", v)}
          />
        ) : (
          <DomainsForm
            resource={resource}
            data={query.data}
            busy={busy}
            onReview={(a, v) => void review(a, v)}
          />
        ))
      )}
    </section>
  );
}
function SettingsForm({
  product,
  settings,
  busy,
  onReview,
}: {
  product: "Worker" | "Pages";
  settings: Record<string, unknown>;
  busy: boolean;
  onReview: (v: Record<string, unknown>) => void;
}) {
  const pages = product === "Pages";
  const build = (settings.build_config ?? {}) as Record<string, string>;
  const [date, setDate] = useState(
    String(settings.compatibility_date ?? "").slice(0, 10),
  );
  const [flags, setFlags] = useState(
    ((settings.compatibility_flags ?? []) as string[]).join(", "),
  );
  const [cpu, setCpu] = useState(
    String((settings.limits as { cpu_ms?: number })?.cpu_ms ?? ""),
  );
  const [logs, setLogs] = useState(
    (settings.observability as { enabled?: boolean })?.enabled ?? false,
  );
  const [branch, setBranch] = useState(
    String(settings.production_branch ?? ""),
  );
  const [command, setCommand] = useState(build.build_command ?? "");
  const [output, setOutput] = useState(build.destination_dir ?? "");
  const [root, setRoot] = useState(build.root_dir ?? "");
  const values: Record<string, unknown> = pages
    ? {
        production_branch: branch,
        build_config: {
          build_command: command,
          destination_dir: output,
          root_dir: root,
        },
      }
    : {
        compatibility_date: date,
        compatibility_flags: flags
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        ...(cpu ? { limits: { cpu_ms: Number(cpu) } } : {}),
        observability: { enabled: logs },
      };
  const patch = Object.fromEntries(
    Object.entries(values).filter(
      ([k, v]) =>
        JSON.stringify(v) !==
        JSON.stringify(
          k === "observability"
            ? {
                enabled:
                  (settings.observability as { enabled?: boolean })?.enabled ??
                  false,
              }
            : k === "limits"
              ? { cpu_ms: (settings.limits as { cpu_ms?: number })?.cpu_ms }
              : settings[k],
        ),
    ),
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onReview(patch);
      }}
    >
      <fieldset disabled={busy}>
        {pages ? (
          <>
            <label className="field">
              Production branch
              <input
                required
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              />
            </label>
            <label className="field">
              Build command
              <input
                value={command}
                onChange={(e) => setCommand(e.target.value)}
              />
            </label>
            <label className="field">
              Build output directory
              <input
                value={output}
                onChange={(e) => setOutput(e.target.value)}
              />
            </label>
            <label className="field">
              Root directory
              <input value={root} onChange={(e) => setRoot(e.target.value)} />
            </label>
          </>
        ) : (
          <>
            <label className="field">
              Compatibility date
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label className="field">
              Compatibility flags
              <input
                value={flags}
                placeholder="nodejs_compat"
                onChange={(e) => setFlags(e.target.value)}
              />
              <small>Separate flags with commas.</small>
            </label>
            <label className="field">
              CPU limit (ms)
              <input
                type="number"
                min={1}
                max={300000}
                value={cpu}
                placeholder="Account default"
                onChange={(e) => setCpu(e.target.value)}
              />
            </label>
            <label className="management-checkbox">
              <input
                type="checkbox"
                checked={logs}
                onChange={(e) => setLogs(e.target.checked)}
              />
              Enable observability
            </label>
          </>
        )}
        <Button
          type="submit"
          variant="default"
          disabled={busy || !Object.keys(patch).length}
        >
          Review settings
        </Button>
      </fieldset>
    </form>
  );
}
function DomainsForm({
  resource,
  data,
  busy,
  onReview,
}: {
  resource: Resource;
  data: ManagementView;
  busy: boolean;
  onReview: (
    action: "attach" | "remove",
    values: Record<string, unknown>,
  ) => void;
}) {
  const pages = resource.product === "Pages";
  const [hostname, setHostname] = useState("");
  const [zone, setZone] = useState("");
  const [target, setTarget] = useState(
    pages ? (data.targets?.[0]?.value ?? "") : resource.name,
  );
  useEffect(() => {
    setHostname("");
    setZone("");
    setTarget(pages ? (data.targets?.[0]?.value ?? "") : resource.name);
  }, [resource.name, pages]);
  return (
    <>
      {data.domains?.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Domain</th>
                <th>Target</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.domains.map((d) => (
                <tr key={d.id}>
                  <td>{d.hostname}</td>
                  <td>
                    {d.dnsAvailable
                      ? d.target || "External DNS"
                      : "DNS unavailable"}
                    {d.environment &&
                      d.environment !== "production" &&
                      ` (${d.environment})`}
                  </td>
                  <td>{d.status}</td>
                  <td>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setHostname(d.hostname);
                        setZone(d.zoneId);
                        setTarget(d.target || data.targets?.[0]?.value || "");
                      }}
                    >
                      Edit target
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        onReview("remove", { hostname: d.hostname })
                      }
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No custom domains attached.</p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onReview("attach", {
            hostname: hostname.trim(),
            zoneId: zone,
            target,
          });
        }}
      >
        <fieldset disabled={busy}>
          <h4>
            {data.domains?.some((d) => d.hostname === hostname)
              ? "Change domain target"
              : "Attach domain"}
          </h4>
          <label className="field">
            Hostname
            <input
              required
              placeholder="app.example.com"
              value={hostname}
              onChange={(e) => {
                setHostname(e.target.value);
                const match = data.zones
                  ?.filter(
                    (z) =>
                      e.target.value === z.name ||
                      e.target.value.endsWith(`.${z.name}`),
                  )
                  .sort((a, b) => b.name.length - a.name.length)[0];
                if (match) setZone(match.id);
              }}
            />
          </label>
          <label className="field">
            Zone
            <select
              required
              value={zone}
              onChange={(e) => setZone(e.target.value)}
            >
              <option value="">Select zone</option>
              {data.zones?.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {pages ? "Environment / branch" : "Target Worker"}
            <select
              required
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">Select target</option>
              {target && !data.targets?.some((t) => t.value === target) && (
                <option value={target}>{target} (current)</option>
              )}
              {data.targets?.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <p>
            {pages
              ? "Preview branches appear after a successful deployment. Activate a new domain on production before selecting a preview branch."
              : "Select the deployed Worker for the intended environment, such as app-staging."}
          </p>
          <Button
            type="submit"
            variant="default"
            disabled={busy || !zone || !target}
          >
            {busy ? "Preparing…" : "Review domain change"}
          </Button>
        </fieldset>
      </form>
    </>
  );
}
