import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useUI } from "../lib/store";
import { Button } from "../components/ui/button";
import { ErrorBox } from "../components/shared";
import { formatTimestamp } from "../lib/utils";
import {
  loadSiteAnalytics,
  accountAnalyticsSchema,
  webAnalyticsSchema,
  bandwidth,
  type AccountAnalytics,
  type WebAnalytics,
} from "../lib/site-analytics";
function chartDate(value: string, timezone = false) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(timezone ? { timeZoneName: "short" as const } : {}),
  }).format(new Date(value));
}

export function SiteAnalytics({ kind }: { kind: "account" | "web" }) {
  const { account, mode } = useUI();
  const [hours, setHours] = useState(24);
  const [hostInput, setHostInput] = useState("");
  const [host, setHost] = useState("");
  const query = useQuery({
    queryKey: [
      "resources",
      mode,
      account.profile,
      account.id,
      "site-analytics",
      kind,
      hours,
      host,
    ],
    enabled: !!account.id,
    retry: false,
    staleTime: 300000,
    queryFn: async () => {
      const data = await loadSiteAnalytics(
        kind,
        mode,
        account.profile,
        account.id,
        hours,
        host,
      );
      return kind === "account"
        ? { kind: "account" as const, data: accountAnalyticsSchema.parse(data) }
        : { kind: "web" as const, data: webAnalyticsSchema.parse(data) };
    },
  });
  return (
    <div className="page-content analytics-page site-analytics-page">
      <div className="page-heading">
        <div>
          <h1>{kind === "account" ? "Account analytics" : "Web analytics"}</h1>
          <p>
            {account.name} ·{" "}
            {mode === "demo"
              ? "Sample data"
              : kind === "account"
                ? "HTTP traffic across your zones"
                : "Browser-recorded visits and page views"}
          </p>
        </div>
        <div className="site-analytics-controls">
          <select
            aria-label="Analytics time range"
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          >
            <option value={24}>Last 24 complete hours</option>
            <option value={168}>Last 7 complete days</option>
          </select>
          <Button
            disabled={!account.id || query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw size={14} />
            {query.isFetching ? "Loading…" : "Refresh"}
          </Button>
        </div>
      </div>
      {kind === "web" && (
        <form
          className="site-host-filter"
          onSubmit={(e) => {
            e.preventDefault();
            setHost(hostInput.trim().toLowerCase());
          }}
        >
          <label className="field">
            Hostname
            <input
              value={hostInput}
              onChange={(e) => setHostInput(e.target.value)}
              placeholder="All sites, or enter example.com"
              maxLength={253}
            />
          </label>
          <Button type="submit">Apply</Button>
        </form>
      )}
      {!account.id ? (
        <p>Connect an account in Settings to load analytics.</p>
      ) : query.isPending ? (
        <p role="status">Loading analytics…</p>
      ) : query.error ? (
        <ErrorBox error={query.error} retry={() => void query.refetch()} />
      ) : (
        query.data && (
          <>
            <p className="analytics-period">
              {chartDate(query.data.data.start)} –{" "}
              {chartDate(query.data.data.end, true)}
            </p>
            {query.data.kind === "account" ? (
              <AccountReport data={query.data.data} />
            ) : (
              <WebReport data={query.data.data} />
            )}
          </>
        )
      )}
    </div>
  );
}
function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
function AccountReport({ data }: { data: AccountAnalytics }) {
  const totals = data.sites.reduce(
    (a, b) => ({
      requests: a.requests + b.requests,
      bytes: a.bytes + b.bytes,
      cachedRequests: a.cachedRequests + b.cachedRequests,
      threats: a.threats + b.threats,
    }),
    { requests: 0, bytes: 0, cachedRequests: 0, threats: 0 },
  );
  const available = data.sites.length > 0;
  const note = data.failures.length
    ? "Available zones only"
    : "All accessible zones";
  return (
    <>
      {!!data.failures.length && (
        <div className="notice" role="alert">
          Partial report: analytics could not be loaded for{" "}
          {data.failures.join(", ")}. Check zone access, Analytics read
          permission, or try a shorter period. Totals cover {data.sites.length}{" "}
          of {data.totalZones} zones.
        </div>
      )}
      <div className="analytics-metrics">
        <Metric
          label="Requests"
          value={available ? totals.requests.toLocaleString() : "—"}
          note={note}
        />
        <Metric
          label="Bandwidth"
          value={available ? bandwidth(totals.bytes) : "—"}
          note={note}
        />
        <Metric
          label="Cache hit rate"
          value={
            totals.requests
              ? `${((totals.cachedRequests / totals.requests) * 100).toFixed(1)}%`
              : "—"
          }
          note="Cached requests / requests"
        />
        <Metric
          label="Threats"
          value={available ? totals.threats.toLocaleString() : "—"}
          note="Threats reported by Cloudflare"
        />
      </div>
      {available ? (
        <>
          <TrafficChart
            points={data.series.map((r) => ({
              time: r.time,
              value: r.requests,
            }))}
            label="Requests over time"
            start={data.start}
            end={data.end}
          />
          <section className="analytics-traffic">
            <h2>Traffic by zone</h2>
            <div className="investigate-table">
              <table>
                <thead>
                  <tr>
                    <th>Zone</th>
                    <th>Requests</th>
                    <th>Bandwidth</th>
                    <th>Cache hit rate</th>
                    <th>Threats</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sites.map((s) => (
                    <tr key={s.label}>
                      <td>{s.label}</td>
                      <td>{s.requests.toLocaleString()}</td>
                      <td>{bandwidth(s.bytes)}</td>
                      <td>
                        {s.requests
                          ? `${((s.cachedRequests / s.requests) * 100).toFixed(1)}%`
                          : "—"}
                      </td>
                      <td>{s.threats.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        !data.totalZones && <p>No zones were found in this account.</p>
      )}
    </>
  );
}
function WebReport({ data }: { data: WebAnalytics }) {
  const views = data.series.reduce((n, r) => n + r.views, 0),
    visits = data.series.reduce((n, r) => n + r.visits, 0);
  return (
    <>
      <div className="analytics-metrics">
        <Metric
          label="Page views"
          value={views.toLocaleString()}
          note="Recorded by the Web Analytics beacon"
        />
        <Metric
          label="Visits"
          value={visits.toLocaleString()}
          note="Page views from another site or direct link"
        />
        <Metric
          label="Views per visit"
          value={visits ? (views / visits).toFixed(2) : "—"}
          note="Page views / visits"
        />
      </div>
      <p className="analytics-note">
        Beacon activity · Data may be sampled. Visits are not unique visitors.
      </p>
      {!data.series.length ? (
        <p className="analytics-empty">
          No Web Analytics events for this selection. Check the hostname, time
          range, and beacon installation.
        </p>
      ) : (
        <>
          <TrafficChart
            points={data.series.map((r) => ({ time: r.label, value: r.views }))}
            label="Page views over time"
            start={data.start}
            end={data.end}
          />
          <div className="site-breakdowns">
            {(
              [
                ["Top sites", data.hosts],
                ["Top pages", data.paths],
                ["Referrers", data.referrers],
                ["Countries", data.countries],
                ["Browsers", data.browsers],
              ] as const
            ).map(([label, rows]) => (
              <section className="analytics-traffic" key={label}>
                <h2>{label}</h2>
                <p className="muted">Top 10 by page views</p>
                {!rows.length && (
                  <p className="analytics-empty">No data for this period.</p>
                )}
                {rows.map((r) => (
                  <div className="site-breakdown-row" key={r.label}>
                    <div
                      className="site-breakdown-fill"
                      aria-hidden="true"
                      style={{
                        width: `${(r.views / Math.max(1, ...rows.map((row) => row.views))) * 100}%`,
                      }}
                    />
                    <span title={r.label}>
                      {r.label ||
                        (label === "Referrers"
                          ? "Direct / no referrer"
                          : "Unknown")}
                    </span>
                    <strong>{r.views.toLocaleString()}</strong>
                  </div>
                ))}
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}
function TrafficChart({
  points,
  label,
  start,
  end,
}: {
  points: { time: string; value: number }[];
  label: string;
  start: string;
  end: string;
}) {
  const byTime = new Map(points.map((p) => [Date.parse(p.time), p.value]));
  const buckets = Array.from(
    { length: Math.round((Date.parse(end) - Date.parse(start)) / 3600000) },
    (_, i) => {
      const time = Date.parse(start) + i * 3600000;
      return {
        time: new Date(time).toISOString(),
        value: byTime.get(time) ?? 0,
      };
    },
  );
  const peak = Math.max(0, ...buckets.map((p) => p.value));
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, peak)));
  const max = Math.max(4, Math.ceil(peak / magnitude) * magnitude);
  return (
    <section className="analytics-traffic">
      <div className="overview-section-heading">
        <h2>{label}</h2>
        <span>
          Hourly · peak{" "}
          {Math.max(0, ...buckets.map((p) => p.value)).toLocaleString()}
        </span>
      </div>
      <div className="site-chart-plot">
        <div className="site-chart-axis" aria-hidden="true">
          {[max, max * 0.75, max * 0.5, max * 0.25, 0].map((value) => (
            <span key={value}>
              {value.toLocaleString(undefined, { notation: "compact" })}
            </span>
          ))}
        </div>
        <div className="site-traffic-chart" role="group" aria-label={label}>
          {buckets.map((p) => (
            <div
              key={p.time}
              className="site-chart-column"
              tabIndex={0}
              title={`${formatTimestamp(p.time)} · ${p.value.toLocaleString()}`}
              aria-label={`${formatTimestamp(p.time)}: ${p.value.toLocaleString()}`}
            >
              <span style={{ height: `${(p.value / max) * 100}%` }} />
              <div className="site-chart-tooltip">
                {formatTimestamp(p.time)}
                <br />
                {p.value.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="site-chart-range">
        <span>{chartDate(start)}</span>
        <span>{chartDate(end, true)}</span>
      </div>
    </section>
  );
}
