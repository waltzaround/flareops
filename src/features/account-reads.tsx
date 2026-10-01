import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUI } from "../lib/store";
import { accountRead, agentResult, tokenResult } from "../lib/account-reads";
import { Button } from "../components/ui/button";
import { Empty, ErrorBox, Loading } from "../components/shared";
import { DashboardLink } from "../components/unsupported-feature";
import { PageHeaderActions } from "../components/page-header-actions";
const date = (value: string | number | null) =>
  value ? new Date(value).toLocaleString() : "—";
const metric = (value: number | null) =>
  value === null ? "—" : value.toLocaleString();

export function AccountTokens() {
  const { account, mode } = useUI();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const query = useQuery({
    queryKey: ["account-tokens", mode, account.id, account.profile, page],
    queryFn: async () =>
      tokenResult.parse(
        await accountRead(
          "tokens",
          account.profile,
          account.id,
          { page },
          mode === "demo",
        ),
      ),
    enabled: !!account.id,
    retry: false,
  });
  const rows = query.data?.items.filter((row) =>
    `${row.name} ${row.status}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section className="native-account-read">
      <PageHeaderActions>
        <DashboardLink />
      </PageHeaderActions>
      <p>
        Inspect account token names, status, and expiry. Create, rotate, or
        revoke tokens in the dashboard.
      </p>
      <div className="native-read-controls">
        <label className="field">
          Filter this page
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Token name or status"
          />
        </label>
        <Button
          disabled={!account.id || query.isFetching}
          onClick={() => void query.refetch()}
        >
          Refresh
        </Button>
      </div>
      {mode === "demo" && <p className="muted">Sample data</p>}
      {!account.id ? (
        <Empty
          title="Connect an account"
          description="Select an account to view its tokens."
        />
      ) : query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorBox error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          {rows?.length ? (
            <div className="native-read-table">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Issued</th>
                    <th>Expires</th>
                    <th>Last used</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.name}</strong>
                        <small>{row.id}</small>
                      </td>
                      <td>{row.status || "—"}</td>
                      <td>{date(row.issued)}</td>
                      <td>{date(row.expires)}</td>
                      <td>{date(row.lastUsed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title={search ? "No matching tokens" : "No account tokens"}
              description={
                search
                  ? "Try another filter."
                  : "No tokens are visible to this profile."
              }
            />
          )}
          <div className="native-read-controls">
            <Button
              disabled={page === 1 || query.isFetching}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span>Page {page}</span>
            <Button
              disabled={!query.data?.hasNext || query.isFetching}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

export function AgentTraces() {
  const { account, mode } = useUI();
  const [hours, setHours] = useState(24);
  const [end, setEnd] = useState(Date.now);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [cursors, setCursors] = useState<string[]>([""]);
  const cursor = cursors.at(-1)!;
  const query = useQuery({
    queryKey: [
      "agent-traces",
      mode,
      account.id,
      account.profile,
      hours,
      end,
      search,
      cursor,
    ],
    queryFn: async () =>
      agentResult.parse(
        await accountRead(
          "agents",
          account.profile,
          account.id,
          { hours, end, search, cursor },
          mode === "demo",
        ),
      ),
    enabled: !!account.id,
    retry: false,
  });
  function refresh() {
    setCursors([""]);
    setEnd(Date.now());
  }
  return (
    <section className="native-account-read">
      <PageHeaderActions>
        <DashboardLink />
      </PageHeaderActions>
      <form
        className="native-read-controls"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(draft.trim());
          refresh();
        }}
      >
        <label className="field">
          Time range
          <select
            value={hours}
            onChange={(e) => {
              setHours(Number(e.target.value));
              refresh();
            }}
          >
            <option value={1}>Last hour</option>
            <option value={24}>Last 24 hours</option>
            <option value={72}>Last 3 days</option>
            <option value={168}>Last 7 days</option>
          </select>
        </label>
        <label className="field">
          Search traces
          <input
            maxLength={200}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Agent, service, or trace text"
          />
        </label>
        <Button disabled={!account.id || query.isFetching}>Search</Button>
        <Button
          type="button"
          disabled={!account.id || query.isFetching}
          onClick={refresh}
        >
          Refresh
        </Button>
      </form>
      <p className="muted">
        {mode === "demo" ? "Sample data · " : ""}
        {date(end - hours * 3600000)} – {date(end)}. Results depend on tracing
        being enabled and your plan’s retention.
      </p>
      {!account.id ? (
        <Empty
          title="Connect an account"
          description="Select an account to view agent runs."
        />
      ) : query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorBox error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          {query.data?.items.length ? (
            <div className="agent-run-list">
              {query.data.items.map((row) => (
                <article key={row.id}>
                  <header>
                    <strong>{row.name || row.traceId}</strong>
                    <span>{row.status}</span>
                  </header>
                  <p>
                    {row.services.join(", ") || "Unknown service"} ·{" "}
                    {date(row.started)}
                  </p>
                  <div className="agent-run-metrics">
                    <span>{metric(row.duration)} ms</span>
                    <span>{metric(row.inputTokens)} input tokens</span>
                    <span>{metric(row.outputTokens)} output tokens</span>
                    <span>{metric(row.spans)} spans</span>
                  </div>
                  <details>
                    <summary>Run details</summary>
                    <dl>
                      <dt>Trace ID</dt>
                      <dd>{row.traceId}</dd>
                      <dt>Models</dt>
                      <dd>{row.models.join(", ") || "—"}</dd>
                    </dl>
                  </details>
                </article>
              ))}
            </div>
          ) : (
            <Empty
              title="No agent runs found"
              description="Try another time range or enable agent tracing in your Worker’s observability configuration."
            />
          )}
          <div className="native-read-controls">
            <Button
              disabled={cursors.length === 1 || query.isFetching}
              onClick={() => setCursors((c) => c.slice(0, -1))}
            >
              Previous
            </Button>
            <span>Page {cursors.length}</span>
            <Button
              disabled={!query.data?.nextCursor || query.isFetching}
              onClick={() => setCursors((c) => [...c, query.data!.nextCursor!])}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
