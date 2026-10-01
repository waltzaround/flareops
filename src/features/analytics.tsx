import { RefreshCw } from "lucide-react";
import { useHistory, useWorkerTraffic } from "../lib/query";
import { useUI } from "../lib/store";
import { Button } from "../components/ui/button";
import { ErrorBox } from "../components/shared";
import { ActivityView } from "./activity";

function formatBytes(value: number | null | undefined) {
  if (value == null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index =
    value > 0
      ? Math.min(Math.floor(Math.log(value) / Math.log(1000)), units.length - 1)
      : 0;
  return `${(value / 1000 ** index).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${units[index]}`;
}

export function Analytics({
  view = "overview",
}: {
  view?: "overview" | "workers" | "commands";
}) {
  const { account, mode } = useUI();
  const history = useHistory();
  const traffic = useWorkerTraffic(view !== "commands");
  const records = (history.data || []).filter(
    (h) =>
      (!h.accountId || h.accountId === account.id) &&
      (!h.profile || h.profile === account.profile),
  );
  const failures = records.filter((h) => !h.success).length;
  const workers = Object.entries(traffic.data?.requests || {}).sort(
    (a, b) => b[1] - a[1],
  );
  const total = workers.reduce((sum, [, count]) => sum + count, 0);
  const max = Math.max(1, ...workers.map(([, count]) => count));
  const unavailable = history.isPending || history.isError;
  return (
    <div className="page-content analytics-page">
      <div className="page-heading">
        <div>
          <h1>
            {view === "workers"
              ? "Worker traffic"
              : view === "commands"
                ? "Command analytics"
                : "Workspace"}
          </h1>
          <p>
            {view === "workers"
              ? "Traffic and performance across your Workers in the last 24 hours"
              : view === "commands"
                ? "Performance and reliability of your workspace commands"
                : "Analytics, logs, and Cloudflare tools"}{" "}
            · {account.name}
          </p>
        </div>
        <Button
          disabled={history.isFetching || traffic.isFetching}
          onClick={() => {
            void history.refetch();
            if (account.id && view !== "commands") void traffic.refetch();
          }}
        >
          <RefreshCw size={14} />
          Refresh
        </Button>
      </div>
      <div
        className={`analytics-metrics${view === "workers" ? " analytics-worker-metrics" : ""}`}
      >
        {view !== "commands" && (
          <div>
            <span>Worker requests · 24h</span>
            <strong>{traffic.data ? total.toLocaleString() : "—"}</strong>
            <small>
              {mode === "demo" ? "Sample traffic" : "Cloudflare Analytics"}
            </small>
          </div>
        )}
        {view === "workers" && (
          <>
            <div>
              <span>Bandwidth · 24h</span>
              <strong>{formatBytes(traffic.data?.bandwidthBytes)}</strong>
              <small>Response body data transferred</small>
            </div>
            <div title="Worker wall time includes I/O and background tasks; it is not end-to-end client latency.">
              <span>Response time · 24h</span>
              <strong>
                {traffic.data?.averageWallTimeMs == null
                  ? "—"
                  : `${traffic.data.averageWallTimeMs.toLocaleString(undefined, { maximumFractionDigits: 1 })} ms`}
              </strong>
              <small>Average Worker wall time, including I/O</small>
            </div>
            <div>
              <span>Worker errors · 24h</span>
              <strong>{traffic.data?.errors?.toLocaleString() ?? "—"}</strong>
              <small>
                {traffic.data?.errors != null && total > 0
                  ? `${((traffic.data.errors / total) * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}% invocation error rate`
                  : "Invocation errors"}
              </small>
            </div>
            <div>
              <span>Subrequests · 24h</span>
              <strong>
                {traffic.data?.subrequests?.toLocaleString() ?? "—"}
              </strong>
              <small>Outgoing fetch requests from Workers</small>
            </div>
            <div>
              <span>Active Workers · 24h</span>
              <strong>
                {traffic.data
                  ? workers
                      .filter(([, count]) => count > 0)
                      .length.toLocaleString()
                  : "—"}
              </strong>
              <small>Workers with at least one request</small>
            </div>
          </>
        )}
        {view !== "workers" && (
          <>
            <div>
              <span>Commands</span>
              <strong>{unavailable ? "—" : records.length}</strong>
              <small>Retained command history</small>
            </div>
            <div>
              <span>Failed commands</span>
              <strong>{unavailable ? "—" : failures}</strong>
              <small>
                {records.length && !unavailable
                  ? `${Math.round(((records.length - failures) / records.length) * 100)}% success rate`
                  : "No success rate available"}
              </small>
            </div>
            <div>
              <span>Average duration</span>
              <strong>
                {records.length && !unavailable
                  ? `${Math.round(records.reduce((sum, h) => sum + h.durationMs, 0) / records.length).toLocaleString()} ms`
                  : "—"}
              </strong>
              <small>Command execution time</small>
            </div>
          </>
        )}
      </div>
      {view !== "commands" && (
        <section className="analytics-traffic">
          <div className="overview-section-heading">
            <h2>Requests by Worker</h2>
            <span>Last 24 hours</span>
          </div>
          {traffic.isError ? (
            <ErrorBox error={traffic.error} />
          ) : !account.id ? (
            <p>Connect an account to view Worker traffic.</p>
          ) : traffic.isPending ? (
            <p>Loading Worker traffic…</p>
          ) : workers.length ? (
            <div className="analytics-bars">
              {workers.map(([name, count]) => (
                <div className="analytics-worker" key={name}>
                  <span title={name}>{name}</span>
                  <div className="analytics-track">
                    <div style={{ width: `${(count / max) * 100}%` }} />
                  </div>
                  <strong>{count.toLocaleString()}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p>No Worker requests in this period.</p>
          )}
          {traffic.data && (
            <small className="analytics-period">
              {new Date(traffic.data.start).toLocaleString()} –{" "}
              {new Date(traffic.data.end).toLocaleString()}
            </small>
          )}
        </section>
      )}
      {view !== "workers" && <ActivityView embedded />}
    </div>
  );
}
