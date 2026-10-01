// Adapter for pinned cf 1.0.0-beta.8. Credentials remain inside this child.
import { pathToFileURL } from "node:url";
export function summarizeTraffic(rows) {
  if (!Array.isArray(rows) || rows.length >= 10000)
    throw Error("Traffic analytics response is incomplete.");
  const requests = Object.create(null);
  const totals = {
    responseBodySize: 0,
    wallTime: 0,
    errors: 0,
    subrequests: 0,
  };
  for (const row of rows) {
    const name = row?.dimensions?.scriptName;
    const count = row?.sum?.requests;
    if (typeof name !== "string" || !Number.isFinite(count) || count < 0)
      throw Error("Traffic analytics response is incompatible.");
    requests[name] = (requests[name] ?? 0) + count;
    for (const key of Object.keys(totals)) {
      const value = row.sum?.[key];
      totals[key] =
        totals[key] !== null && Number.isFinite(value) && value >= 0
          ? totals[key] + value
          : null;
    }
  }
  const count = Object.values(requests).reduce((sum, value) => sum + value, 0);
  return {
    requests,
    bandwidthBytes: totals.responseBodySize,
    // Cloudflare wall time is in microseconds, including I/O and waitUntil.
    averageWallTimeMs:
      count > 0 && totals.wallTime !== null
        ? totals.wallTime / count / 1000
        : null,
    errors: totals.errors,
    subrequests: totals.subrequests,
  };
}

// The desktop embeds this adapter with node -e; imports only expose helpers.
if (process.execArgv.includes("-e")) {
  const [dist, profile, account] = process.argv.slice(1);
  try {
    if (!/^[a-f0-9]{32}$/i.test(account) || !profile || profile.startsWith("-"))
      throw Error("Invalid account context.");
    const base = pathToFileURL(dist + "/");
    const { p: setProfile, s: getToken } = await import(
      new URL("oauth-D6EZEBcY.mjs", base)
    );
    setProfile(profile);
    const token = await getToken();
    if (!token) throw Error("Sign in again to access traffic analytics.");
    const end = new Date();
    const start = new Date(end.getTime() - 86400000);
    const response = await fetch(
      "https://api.cloudflare.com/client/v4/graphql",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `query WorkerTraffic($account: string!, $start: Time!, $end: Time!) {
        viewer { accounts(filter: {accountTag: $account}) {
          workersInvocationsAdaptive(limit: 10000, filter: {datetime_geq: $start, datetime_lt: $end}) {
            dimensions { scriptName } sum { requests errors subrequests responseBodySize wallTime }
          }
        } }
      }`,
          variables: {
            account,
            start: start.toISOString(),
            end: end.toISOString(),
          },
        }),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok)
      throw Error(
        `Traffic analytics unavailable (HTTP ${response.status}). Check this login's analytics permissions.`,
      );
    const result = await response.json();
    if (result.errors?.length)
      throw Error(
        "Cloudflare could not provide traffic analytics. Check this login’s Analytics read permission and account access.",
      );
    const accounts = result.data?.viewer?.accounts;
    if (!Array.isArray(accounts) || accounts.length !== 1)
      throw Error("Traffic analytics unavailable for the selected account.");
    const rows = accounts[0].workersInvocationsAdaptive;
    console.log(
      JSON.stringify({
        ...summarizeTraffic(rows),
        start: start.toISOString(),
        end: end.toISOString(),
      }),
    );
  } catch (error) {
    // Never emit credential state, headers, raw responses, or exception stacks.
    console.error(
      error instanceof Error ? error.message : "Traffic analytics unavailable.",
    );
    process.exitCode = 1;
  }
}
