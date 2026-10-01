import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useUI } from "../lib/store";
import { loadStreamAnalytics } from "../lib/stream-analytics";
import { Button } from "../components/ui/button";
import { Empty, ErrorBox, Loading } from "../components/shared";
const number = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 1 });
export function StreamAnalytics() {
  const { account, mode } = useUI();
  const [hours, setHours] = useState(24);
  const [video, setVideo] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const query = useQuery({
    queryKey: [
      "resources",
      mode,
      account.profile,
      account.id,
      "stream-analytics",
      hours,
      video,
    ],
    queryFn: () =>
      loadStreamAnalytics(
        account.profile,
        account.id,
        hours,
        video,
        mode === "demo",
      ),
    enabled: !!account.id,
    retry: false,
    staleTime: 300000,
  });
  const data = query.data;
  const total = data?.series.reduce((sum, row) => sum + row.minutes, 0) ?? 0;
  const maximum = Math.max(
    1,
    ...(data?.series.map((row) => row.minutes) ?? []),
  );
  return (
    <section className="stream-analytics">
      <form
        className="stream-filters"
        onSubmit={(e) => {
          e.preventDefault();
          const uid = draft.trim();
          if (uid && !/^[a-f0-9]{32}$/i.test(uid)) {
            setError("Enter a 32-character video UID.");
            return;
          }
          setError("");
          setVideo(uid);
        }}
      >
        <label className="field">
          Date range
          <select
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          >
            <option value={24}>Last 24 hours</option>
            <option value={168}>Last 7 days</option>
          </select>
        </label>
        <label className="field">
          Video UID (optional)
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="All videos"
          />
        </label>
        <Button type="submit">Apply filter</Button>
        <Button
          type="button"
          disabled={!account.id || query.isFetching}
          onClick={() => void query.refetch()}
        >
          Refresh
        </Button>
      </form>
      {error && <p role="alert">{error}</p>}
      {!account.id ? (
        <Empty
          title="Connect an account"
          description="Choose a Cloudflare account to view Stream analytics."
        />
      ) : query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <ErrorBox error={query.error} retry={() => void query.refetch()} />
      ) : (
        data && (
          <>
            <p className="muted">
              {mode === "demo" ? "Sample data · " : ""}
              {new Date(data.start).toLocaleString()} –{" "}
              {new Date(data.end).toLocaleString()} · Complete hours, grouped by
              UTC date.
            </p>
            <div className="stream-total">
              <strong>{number(total)}</strong>
              <span>Minutes delivered</span>
            </div>
            <p className="muted">
              Video delivery measured by Cloudflare across Stream players and
              other HLS/DASH players.
            </p>
            {data.series.length ? (
              <section
                aria-label="Daily minutes delivered"
                className="stream-daily"
              >
                <h2>Delivery by day (UTC)</h2>
                {data.series.map((row) => (
                  <div className="stream-day" key={row.label}>
                    <span>{row.label}</span>
                    <div className="stream-bar-track">
                      <div
                        style={{ width: `${(row.minutes / maximum) * 100}%` }}
                      />
                    </div>
                    <strong>{number(row.minutes)}</strong>
                  </div>
                ))}
              </section>
            ) : (
              <p>No delivery recorded in this period.</p>
            )}
            <div className="stream-breakdowns">
              {[
                { title: "Top videos", rows: data.videos },
                { title: "Viewer countries", rows: data.countries },
              ].map((group) => (
                <section key={group.title}>
                  <h2>{group.title}</h2>
                  <p className="muted">
                    Up to 100 results, ranked by minutes delivered.
                  </p>
                  <div className="operation-table">
                    <table>
                      <thead>
                        <tr>
                          <th>
                            {group.title === "Top videos"
                              ? "Video UID"
                              : "Country"}
                          </th>
                          <th>Minutes delivered</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((row) => (
                          <tr key={row.label}>
                            <td>{row.label || "Unknown"}</td>
                            <td>{number(row.minutes)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!group.rows.length && <p>No results.</p>}
                </section>
              ))}
            </div>
            <a
              href="https://developers.cloudflare.com/stream/getting-analytics/fetching-bulk-analytics/"
              target="_blank"
              rel="noreferrer"
            >
              About Stream analytics
            </a>
          </>
        )
      )}
    </section>
  );
}
