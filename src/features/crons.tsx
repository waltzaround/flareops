import {
  ListToolbar,
  ListSearch,
  ListRefresh,
} from "../components/list-toolbar";
import { useEffect, useState } from "react";
import { describeCron, nextCronRun, cronOutcome } from "../lib/cron";
import { useWorkerCrons } from "../lib/query";
import { useUI } from "../lib/store";
import { Button } from "../components/ui/button";
import { ErrorBox } from "../components/shared";

export function CronTriggers() {
  const account = useUI((s) => s.account);
  const crons = useWorkerCrons(true);
  const [search, setSearch] = useState("");
  const schedules = (crons.data?.schedules ?? []).filter((schedule) =>
    `${schedule.worker} ${schedule.cron} ${describeCron(schedule.cron)}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const formatTime = (date: Date) =>
    date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  return (
    <div className="page-content analytics-page">
      <div className="page-heading">
        <h1>Cron triggers</h1>
      </div>
      <ListToolbar label="Cron trigger filters">
        <ListSearch
          label="Search cron triggers"
          placeholder="Search Workers or schedules…"
          value={search}
          onChange={setSearch}
        />
        <span>
          {schedules.length} {schedules.length === 1 ? "trigger" : "triggers"}
        </span>
        <ListRefresh
          busy={crons.isFetching}
          disabled={!account.id}
          onRefresh={() => void crons.refetch()}
        />
      </ListToolbar>
      <section className="analytics-traffic" aria-label="Worker cron triggers">
        <div className="overview-section-heading">
          <h2>Schedules</h2>
          {crons.data && (
            <span>
              {crons.data.schedules.length} triggers ·{" "}
              {crons.data.workers - crons.data.failures.length}/
              {crons.data.workers} Workers checked
            </span>
          )}
        </div>
        {crons.isError && (
          <ErrorBox error={crons.error} retry={() => void crons.refetch()} />
        )}
        {!account.id ? (
          <p>Connect an account to view cron triggers.</p>
        ) : crons.isPending ? (
          <p>Loading cron triggers…</p>
        ) : (
          crons.data && (
            <>
              {crons.data.failures.length > 0 && (
                <div role="alert">
                  <p>
                    Could not load schedules for:{" "}
                    {crons.data.failures.join(", ")}. The list is incomplete.
                  </p>
                  <Button
                    onClick={() => void crons.refetch()}
                    disabled={crons.isFetching}
                  >
                    Retry
                  </Button>
                </div>
              )}
              {crons.data.schedules.some((s) => !s.historyAvailable) && (
                <p role="status">
                  Run history unavailable for some triggers. Check Analytics
                  read permission or refresh to retry.
                </p>
              )}
              <p className="cron-timezone">
                Run times: {timeZone} · History: last 7 days
              </p>
              {schedules.length > 0 ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Worker</th>
                        <th>Schedule (UTC)</th>
                        <th title="Calculated from the configured UTC schedule">
                          Next run
                        </th>
                        <th>Last run</th>
                        <th>Last run result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedules.map((schedule, i) => {
                        const next = nextCronRun(schedule.cron, now);
                        return (
                          <tr key={`${schedule.worker}:${schedule.cron}:${i}`}>
                            <td>{schedule.worker}</td>
                            <td>
                              <span title={schedule.cron}>
                                {describeCron(schedule.cron)}
                              </span>
                            </td>
                            <td
                              title={
                                next
                                  ? `${next.toISOString()} · Estimated`
                                  : undefined
                              }
                            >
                              {next ? formatTime(next) : "Unavailable"}
                            </td>
                            <td title={schedule.lastRun?.at}>
                              {!schedule.historyAvailable
                                ? "Unavailable"
                                : schedule.lastRun
                                  ? formatTime(new Date(schedule.lastRun.at))
                                  : "No run in last 7 days"}
                            </td>
                            <td>
                              {schedule.lastRun ? (
                                <span
                                  className={`cron-outcome ${["success", "ok"].includes(schedule.lastRun.status) ? "success" : "failure"}`}
                                >
                                  {cronOutcome(schedule.lastRun.status)}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                !crons.data.failures.length && (
                  <p>
                    {search
                      ? "No matching cron triggers."
                      : "No cron triggers in this account."}
                  </p>
                )
              )}
            </>
          )
        )}
      </section>
    </div>
  );
}
