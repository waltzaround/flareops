// Read-only adapter for pinned cf 1.0.0-beta.8. Credentials stay in this child.
import { pathToFileURL } from 'node:url';

export async function collectCrons(get) {
  // The scripts endpoint returns the complete list and has no pagination parameters.
  const scripts = await get('');
  if (!Array.isArray(scripts) || scripts.some(s => typeof s?.id !== 'string' || !s.id))
    throw Error('Worker list response is incompatible.');
  const names = [...new Set(scripts.map(s => s.id))];
  const schedules = [], failures = [];
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(4, names.length) }, async () => {
    while (index < names.length) {
      const worker = names[index++];
      try {
        const result = await get(`/${encodeURIComponent(worker)}/schedules`);
        if (!Array.isArray(result?.schedules) || result.schedules.some(s => typeof s?.cron !== 'string' || !s.cron))
          throw Error('Incompatible schedules.');
        schedules.push(...result.schedules.map(s => ({ worker, cron: s.cron })));
      } catch {
        failures.push(worker);
      }
    }
  }));
  schedules.sort((a, b) => a.worker.localeCompare(b.worker) || a.cron.localeCompare(b.cron));
  return { schedules, failures: failures.sort(), workers: names.length };
}

// Query each trigger independently so a busy Worker cannot hide another's last run.
export async function attachHistory(result, query, now = new Date()) {
  const end = now.toISOString();
  const start = new Date(now.getTime() - 7 * 86400000).toISOString();
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(4, result.schedules.length) }, async () => {
    while (index < result.schedules.length) {
      const schedule = result.schedules[index++];
      schedule.lastRun = null;
      schedule.historyAvailable = false;
      try {
        const rows = await query({ worker: schedule.worker, cron: schedule.cron, start, end });
        if (!Array.isArray(rows) || rows.length > 1) throw Error();
        if (rows.length) {
          const row = rows[0];
          if (row.scriptName !== schedule.worker || row.cron !== schedule.cron ||
              typeof row.datetime !== 'string' || !Number.isFinite(Date.parse(row.datetime)) ||
              typeof row.status !== 'string' || !row.status) throw Error();
          schedule.lastRun = { at: row.datetime, status: row.status };
        }
        schedule.historyAvailable = true;
      } catch { /* A history failure must not hide the configured schedule. */ }
    }
  }));
  return { ...result, historyStart: start, historyEnd: end };
}

export async function main() {
  try {
    const [dist, profile, account] = process.argv.slice(1);
    if (!/^[a-f0-9]{32}$/i.test(account) || !profile || profile.startsWith('-')) throw Error();
    const { p: setProfile, s: getToken } = await import(new URL('oauth-D6EZEBcY.mjs', pathToFileURL(dist + '/')));
    setProfile(profile);
    const token = await getToken();
    if (!token) throw Error();
    const deadline = AbortSignal.timeout(90000);
    const result = await collectCrons(async suffix => {
      const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts${suffix}`, {
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'error',
        signal: AbortSignal.any([deadline, AbortSignal.timeout(15000)]),
      });
      if (!response.ok) throw Error();
      const body = await response.json();
      if (body.success !== true) throw Error();
      return body.result;
    });
    const withHistory = await attachHistory(result, async variables => {
      const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        redirect: 'error',
        signal: AbortSignal.any([deadline, AbortSignal.timeout(15000)]),
        body: JSON.stringify({
          query: `query CronHistory($account: string!, $worker: string!, $cron: string!, $start: Time!, $end: Time!) {
            viewer { accounts(filter: { accountTag: $account }) {
              workersInvocationsScheduled(limit: 1, orderBy: [datetime_DESC], filter: {
                scriptName: $worker, cron: $cron, datetime_geq: $start, datetime_lt: $end
              }) { scriptName cron datetime status }
            } }
          }`,
          variables: { account, ...variables },
        }),
      });
      if (!response.ok) throw Error();
      const body = await response.json();
      if (body.errors?.length || body.data?.viewer?.accounts?.length !== 1) throw Error();
      return body.data.viewer.accounts[0].workersInvocationsScheduled;
    });
    console.log(JSON.stringify(withHistory));
  } catch {
    // Never print raw responses, tokens, or authentication errors.
    console.error('Unable to load Worker cron triggers. Check your connection and Workers Scripts read permission.');
    process.exitCode = 1;
  }
}
