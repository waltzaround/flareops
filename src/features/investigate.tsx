import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Play, RefreshCw, Plus, Trash2 } from "lucide-react";
import { useUI } from "../lib/store";
import { useResources } from "../lib/query";
import { Button } from "../components/ui/button";
import { ErrorBox } from "../components/shared";
import { formatMetadataValue, formatTimestamp } from "../lib/utils";
import type { Request } from "../lib/types";
import {
  investigationPages,
  logQueryRequest,
  traceRequest,
  readInvestigation,
  logRowsSchema,
  logpushJobsSchema,
  traceResultSchema,
  type InvestigationPage,
  type TraceStep,
} from "../lib/investigate";

export { investigationPages };
export function Investigate({
  page,
  onReview,
}: {
  page: InvestigationPage;
  onReview: (request: Request) => void;
}) {
  const { account, mode } = useUI();
  const zones = useResources("Zones");
  const [zone, setZone] = useState("");
  return (
    <div className="page-content investigate-page">
      <div className="page-heading">
        <div>
          <h1>
            {page}{" "}
            {page === "Rule simulator" && (
              <span className="quiet-tag">Beta</span>
            )}
          </h1>
          <p>
            {account.name} ·{" "}
            {mode === "demo" ? "Demo workspace" : "Live Cloudflare"}
          </p>
        </div>
      </div>
      {page !== "Rule simulator" && (
        <label className="field investigate-scope">
          Scope
          <select value={zone} onChange={(e) => setZone(e.target.value)}>
            <option value="">Account · {account.name}</option>
            {zones.data?.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {zones.error && page !== "Rule simulator" && (
        <ErrorBox error={zones.error} retry={() => void zones.refetch()} />
      )}
      {!account.id ? (
        <p>Connect an account in Settings to use investigation tools.</p>
      ) : (
        <InvestigationContent
          key={`${page}-${mode}-${account.profile}-${account.id}-${zone}`}
          page={page}
          zone={zone}
          onReview={onReview}
        />
      )}
    </div>
  );
}
function InvestigationContent({
  page,
  zone,
  onReview,
}: {
  page: InvestigationPage;
  zone: string;
  onReview: (r: Request) => void;
}) {
  const { account, mode } = useUI();
  const context = {
    accountId: account.id,
    profile: account.profile,
    zoneId: zone || undefined,
  };
  const [sql, setSql] = useState(
    zone
      ? "SELECT clientRequestHost, clientRequestMethod, edgeResponseStatus FROM http_requests LIMIT 100"
      : "SELECT CreatedAt, Action, Allowed, Country FROM access_requests LIMIT 100",
  );
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState("GET");
  const [country, setCountry] = useState("");
  const [body, setBody] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [trace, setTrace] = useState<TraceStep[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [create, setCreate] = useState(false);
  const [name, setName] = useState("");
  const [dataset, setDataset] = useState(
    zone ? "http_requests" : "workers_trace_events",
  );
  const [destination, setDestination] = useState("");
  const [fields, setFields] = useState("");
  const jobs = useQuery({
    queryKey: ["resources", mode, account.profile, account.id, "logpush", zone],
    enabled: page === "Logpush",
    retry: false,
    queryFn: async () =>
      logpushJobsSchema.parse(
        mode === "demo"
          ? [
              {
                id: 1,
                name: "Sample log export",
                dataset: "workers_trace_events",
                enabled: true,
                last_complete: "2026-10-01T08:00:00Z",
              },
            ]
          : await readInvestigation({
              context,
              path: ["logpush", "account-jobs", "list"],
              parameters: {},
            }),
      ),
  });
  async function run() {
    setError(undefined);
    setRows(null);
    setTrace(null);
    setBusy(true);
    try {
      const request =
        page === "Log Explorer"
          ? logQueryRequest(context, sql)
          : traceRequest(
              context,
              url,
              method,
              country,
              ["POST", "PUT", "PATCH"].includes(method) ? body : "",
            );
      if (mode === "demo") {
        throw Error(
          "Switch to a connected live account to run queries and simulations. Demo mode does not evaluate SQL or Cloudflare rules.",
        );
      }
      const result = await readInvestigation(request);
      if (page === "Log Explorer") setRows(logRowsSchema.parse(result));
      else setTrace(traceResultSchema.parse(result).trace);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const mutateJob = (action: string, id?: number, body?: unknown) =>
    onReview({
      context,
      path: ["logpush", "account-jobs", action],
      parameters: id === undefined ? {} : { job_id: String(id) },
      ...(body === undefined ? {} : { body }),
    });
  const columns = [...new Set(rows?.flatMap((r) => Object.keys(r)) ?? [])];
  return (
    <>
      {mode === "demo" && page !== "Logpush" && (
        <p className="notice">
          Connect a live account to run SQL queries and rule simulations. Demo
          mode shows the available controls.
        </p>
      )}
      {page === "Log Explorer" && (
        <section className="investigate-panel">
          <h2>Search your logs</h2>
          <p>
            Query enabled datasets with SQL. Dataset availability and retention
            depend on your Cloudflare subscription.
          </p>
          <label className="field">
            SQL query
            <textarea
              className="mono"
              rows={6}
              value={sql}
              onChange={(e) => setSql(e.target.value)}
            />
          </label>
          <Button onClick={() => void run()} disabled={busy || !sql.trim()}>
            <Play size={14} />
            {busy ? "Searching…" : "Run query"}
          </Button>
          <a
            href="https://developers.cloudflare.com/log-explorer/api/"
            target="_blank"
            rel="noreferrer"
          >
            Query documentation
          </a>
          {rows && (
            <>
              <h2>{rows.length} results</h2>
              <p>
                Showing rows returned by your query. Use SQL filters and LIMIT
                to control the result size.
              </p>
              {rows.length ? (
                <div className="investigate-table">
                  <table>
                    <thead>
                      <tr>
                        {columns.map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i}>
                          {columns.map((c) => (
                            <td key={c}>{formatMetadataValue(r[c] ?? "—")}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>No matching log entries.</p>
              )}
            </>
          )}
        </section>
      )}
      {page === "Rule simulator" && (
        <section className="investigate-panel">
          <h2>Simulate a request</h2>
          <p>
            Use Cloudflare Trace to see how existing rules evaluate a request.
            The hostname must belong to this account. Origin requests are
            skipped.
          </p>
          <label className="field">
            Request URL
            <input
              type="url"
              placeholder="https://your-domain.com/path"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
          <div className="investigate-fields">
            <label className="field">
              Method
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                {[
                  "GET",
                  "POST",
                  "PUT",
                  "PATCH",
                  "DELETE",
                  "HEAD",
                  "OPTIONS",
                ].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Country code (optional)
              <input
                maxLength={2}
                placeholder="NZ"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              />
            </label>
          </div>
          {["POST", "PUT", "PATCH"].includes(method) && (
            <label className="field">
              Request body (optional)
              <textarea
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
          )}
          <Button onClick={() => void run()} disabled={busy || !url.trim()}>
            <Play size={14} />
            {busy ? "Simulating…" : "Run simulation"}
          </Button>
          <a
            href="https://developers.cloudflare.com/rules/trace-request/"
            target="_blank"
            rel="noreferrer"
          >
            About Cloudflare Trace
          </a>
          {trace && (
            <>
              <h2>Rule evaluation</h2>
              {trace.length ? (
                <TraceSteps steps={trace} />
              ) : (
                <p>No trace steps returned.</p>
              )}
            </>
          )}
        </section>
      )}
      {page === "Logpush" && (
        <section className="investigate-panel">
          <div className="overview-section-heading">
            <div>
              <h2>Log delivery jobs</h2>
              <p>Export logs to a configured destination.</p>
            </div>
            <div className="investigate-actions">
              <Button
                onClick={() => void jobs.refetch()}
                disabled={jobs.isFetching}
              >
                <RefreshCw size={14} />
                Refresh
              </Button>
              <Button
                onClick={() => setCreate(!create)}
                disabled={mode === "demo"}
              >
                <Plus size={14} />
                Create job
              </Button>
            </div>
          </div>
          {mode === "demo" && (
            <p>Sample jobs. Connect a live account to manage log delivery.</p>
          )}
          {create && (
            <form
              className="investigate-form"
              onSubmit={(e) => {
                e.preventDefault();
                mutateJob("create", undefined, {
                  name,
                  dataset,
                  destination_conf: destination,
                  enabled: false,
                  output_options: {
                    field_names: fields
                      .split(",")
                      .map((f) => f.trim())
                      .filter(Boolean),
                    timestamp_format: "rfc3339",
                  },
                });
              }}
            >
              <h3>Create a delivery job</h3>
              <label className="field">
                Name
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="field">
                Dataset
                <input
                  required
                  value={dataset}
                  onChange={(e) => setDataset(e.target.value)}
                />
              </label>
              <label className="field">
                Destination configuration
                <input
                  required
                  placeholder="r2://bucket/path"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                />
              </label>
              <label className="field">
                Fields (comma separated)
                <input
                  required
                  value={fields}
                  onChange={(e) => setFields(e.target.value)}
                />
              </label>
              <p>
                New jobs start disabled. Some destinations require ownership
                verification or credentials and must be configured in Cloudflare
                first.
              </p>
              <Button type="submit">Review new job</Button>
            </form>
          )}
          {jobs.isPending && <p role="status">Loading jobs…</p>}
          {jobs.error && (
            <ErrorBox error={jobs.error} retry={() => void jobs.refetch()} />
          )}
          {jobs.data?.length === 0 && <p>No Logpush jobs in this scope.</p>}
          {jobs.data?.map((job) => (
            <article className="investigate-job" key={job.id}>
              <div>
                <h3>{job.name || `Job ${job.id}`}</h3>
                <p>
                  {job.dataset} · {job.enabled ? "Enabled" : "Disabled"}
                </p>
                <small>
                  Last delivery: {formatTimestamp(job.last_complete || "")}
                </small>
                {job.error_message && (
                  <p className="danger">{job.error_message}</p>
                )}
              </div>
              <div className="investigate-actions">
                <Button
                  disabled={mode === "demo"}
                  onClick={() =>
                    mutateJob("update", job.id, { enabled: !job.enabled })
                  }
                >
                  {job.enabled ? "Disable" : "Enable"}
                </Button>
                <Button
                  disabled={mode === "demo"}
                  onClick={() => mutateJob("delete", job.id)}
                  aria-label={`Delete ${job.name || job.id}`}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </article>
          ))}
          <a
            href="https://developers.cloudflare.com/logs/logpush/logpush-job/api-configuration/"
            target="_blank"
            rel="noreferrer"
          >
            Datasets and destination setup
          </a>
        </section>
      )}
      {!!error && <ErrorBox error={error} />}
    </>
  );
}
function TraceSteps({ steps }: { steps: TraceStep[] }) {
  return (
    <ol className="investigate-trace">
      {steps.map((step, i) => (
        <li key={i}>
          <strong>
            {step.description ||
              step.name ||
              step.step_name ||
              step.type ||
              "Evaluation step"}
          </strong>
          <span className="quiet-tag">
            {step.matched === undefined
              ? "Evaluated"
              : step.matched
                ? "Matched"
                : "Not matched"}
            {step.action ? ` · ${step.action}` : ""}
          </span>
          {step.expression && <code>{step.expression}</code>}
          {step.trace && <TraceSteps steps={step.trace} />}
        </li>
      ))}
    </ol>
  );
}
