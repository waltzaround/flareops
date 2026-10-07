import { ListToolbar, ListSearch } from "../components/list-toolbar";
import { useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Trash2,
  XCircle,
} from "lucide-react";
import { useHistory, queryClient } from "../lib/query";
import { clearHistory } from "../lib/cf";
import { useUI } from "../lib/store";
import { Button } from "../components/ui/button";
import { Empty, ErrorBox } from "../components/shared";
import { copy, relativeTime } from "../lib/utils";
export function ActivityView({
  compact = false,
  embedded = false,
}: {
  compact?: boolean;
  embedded?: boolean;
}) {
  const { data: history = [], error } = useHistory();
  const { account, mode } = useUI();
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [clearError, setClearError] = useState<unknown>(null);
  const [clearing, setClearing] = useState(false);
  const records = history.filter(
    (h) =>
      (!h.accountId || h.accountId === account.id) &&
      (!h.profile || h.profile === account.profile),
  );
  const filtered = records.filter(
    (h) =>
      (status === "all" || (status === "success" ? h.success : !h.success)) &&
      `${h.command} ${h.error || ""} ${h.rawStdout} ${h.rawStderr}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div
      className={
        compact
          ? "drawer-content"
          : embedded
            ? "activity-page"
            : "page-content activity-page"
      }
    >
      {!compact && (
        <div className="page-heading">
          <div>
            <div className="eyebrow">A CLEAR PAPER TRAIL</div>
            {embedded ? <h2>Command logs</h2> : <h1>Command logs</h1>}
          </div>
          <Button
            disabled={clearing}
            onClick={async () => {
              setClearing(true);
              setClearError(null);
              try {
                await clearHistory(account.id, account.profile);
                await queryClient.invalidateQueries({ queryKey: ["history"] });
              } catch (error) {
                setClearError(error);
              } finally {
                setClearing(false);
              }
            }}
          >
            <Trash2 size={14} />
            {clearing ? "Clearing…" : "Clear account history"}
          </Button>
        </div>
      )}
      {error && <ErrorBox error={error} />}
      {!!clearError && <ErrorBox error={clearError} />}
      {!compact && (
        <ListToolbar label="Command log filters">
          <ListSearch
            label="Search command logs"
            placeholder="Search commands and output…"
            value={search}
            onChange={setSearch}
          />
          <select
            aria-label="Filter logs by status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="success">Successful</option>
            <option value="failed">Failed</option>
          </select>
          <span>{filtered.length} logs</span>
        </ListToolbar>
      )}
      <div className="activity-list">
        {(compact ? records : filtered).slice(0, compact ? 6 : 200).map((h) => (
          <div className="activity-item" key={h.id + h.command}>
            <button
              className="activity-row"
              aria-expanded={selected === h.id}
              onClick={() => setSelected(selected === h.id ? null : h.id)}
            >
              {h.success ? (
                <span className="success-check">
                  <Check size={13} />
                </span>
              ) : (
                <XCircle size={17} className="danger" />
              )}
              <span className="activity-command">
                <code>{h.command.split(" --")[0]}</code>
                <small>
                  {h.accountId === account.id
                    ? account.name
                    : h.profile || "CLI discovery"}
                </small>
              </span>
              <span className="quiet-tag">{h.profile || "local"}</span>
              <span className="duration">{h.durationMs} ms</span>
              <span className="activity-time">{relativeTime(h.startedAt)}</span>
              {selected === h.id ? (
                <ChevronDown size={15} />
              ) : (
                <ChevronRight size={15} />
              )}
            </button>
            {selected === h.id && (
              <div className="execution-detail">
                {h.error && <ErrorBox error={h.error} />}
                <div className="code-block">
                  <code>{h.command}</code>
                  <Button
                    size="icon"
                    variant="ghost"
                    title="Copy command"
                    onClick={() => copy(h.command)}
                  >
                    <Copy size={14} />
                  </Button>
                </div>
                <div className="execution-columns">
                  <div>
                    <div className="section-label">STDOUT</div>
                    <pre>{h.rawStdout || "No output"}</pre>
                  </div>
                  <div>
                    <div className="section-label">STDERR</div>
                    <pre>{h.rawStderr || "No errors"}</pre>
                  </div>
                </div>
                <div className="execution-bottom">
                  <span>
                    Exit {h.exitCode} ·{" "}
                    {new Date(h.finishedAt).toLocaleString()}
                    {mode === "demo" ? " · Demo" : ""}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => copy(JSON.stringify(h.data, null, 2))}
                  >
                    <Copy size={12} />
                    Copy JSON
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {(compact ? records : filtered).length === 0 && (
        <Empty
          title={records.length ? "No matching logs" : "No command logs yet"}
          description={
            records.length
              ? "Try another search or status filter."
              : "Commands you run in this workspace will appear here."
          }
        />
      )}
    </div>
  );
}
