import { pathToFileURL } from 'node:url';

const count = value => {
  if (!Number.isFinite(value) || value < 0) throw Error('Incompatible analytics data.');
  return value;
};
export function httpRows(rows) {
  if (!Array.isArray(rows) || rows.length >= 1000) throw Error('Incomplete HTTP analytics.');
  return rows.map(row => ({
    time: row.dimensions?.datetime,
    requests: count(row.sum?.requests), bytes: count(row.sum?.bytes),
    cachedRequests: count(row.sum?.cachedRequests), threats: count(row.sum?.threats),
  })).map(row => {
    if (!Number.isFinite(Date.parse(row.time))) throw Error('Invalid analytics timestamp.');
    return row;
  });
}
export function webRows(rows, dimension, full = false) {
  if (!Array.isArray(rows) || (full && rows.length >= 1000)) throw Error('Incomplete web analytics.');
  return rows.map(row => {
    const label = row.dimensions?.[dimension];
    if (typeof label !== 'string') throw Error('Incompatible web analytics dimension.');
    if (full && !Number.isFinite(Date.parse(label))) throw Error('Invalid analytics timestamp.');
    return { label, views: count(row.count), visits: count(row.sum?.visits) };
  });
}
export async function collectAccount(zones, query) {
  const series = new Map(), sites = [], failures = [];
  let index = 0;
  await Promise.all(Array.from({length: Math.min(4, zones.length)}, async () => {
    while (index < zones.length) {
      const zone = zones[index++];
      try {
        const rows = httpRows(await query(zone.id));
        const totals = { requests: 0, bytes: 0, cachedRequests: 0, threats: 0 };
        for (const row of rows) {
          const bucket = series.get(row.time) || {time: row.time, requests: 0, bytes: 0, cachedRequests: 0, threats: 0};
          for (const key of Object.keys(totals)) { totals[key] += row[key]; bucket[key] += row[key]; }
          series.set(row.time, bucket);
        }
        sites.push({label: zone.name, ...totals});
      } catch { failures.push(zone.name); }
    }
  }));
  return { series: [...series.values()].sort((a,b) => a.time.localeCompare(b.time)), sites: sites.sort((a,b) => b.requests - a.requests), failures: failures.sort(), totalZones: zones.length };
}
export function webQuery(host) {
  const filter = `datetime_geq: $start, datetime_lt: $end${host ? ', requestHost: $host' : ''}`;
  const groups = [['series','datetimeHour',1000], ['hosts','requestHost',10], ['paths','requestPath',10], ['referrers','refererHost',10], ['countries','countryName',10], ['browsers','userAgentBrowser',10]];
  return `query WebAnalytics($account: string!, $start: Time!, $end: Time!${host ? ', $host: string!' : ''}) {
    viewer { accounts(filter: {accountTag: $account}) { ${groups.map(([alias,dimension,limit]) => `${alias}: rumPageloadEventsAdaptiveGroups(limit: ${limit}, filter: {${filter}}, orderBy: [${alias === 'series' ? 'datetimeHour_ASC' : 'count_DESC'}]) {count sum {visits} dimensions {${dimension}}}`).join('\n')} } }
  }`;
}
// Cloudflare Stream server-side delivery metrics, grouped independently so top lists do not truncate totals.
export function streamQuery(video) {
  const filter = `datetime_geq: $start, datetime_lt: $end${video ? ', uid: $video' : ''}`;
  const groups = [['series','date',1000,'date_ASC'], ['videos','uid',100,'sum_minutesViewed_DESC'], ['countries','clientCountryName',100,'sum_minutesViewed_DESC']];
  return `query StreamAnalytics($account: string!, $start: Time!, $end: Time!${video ? ', $video: string!' : ''}) {
    viewer { accounts(filter: {accountTag: $account}) { ${groups.map(([alias,dimension,limit,order]) => `${alias}: streamMinutesViewedAdaptiveGroups(limit: ${limit}, filter: {${filter}}, orderBy: [${order}]) {sum {minutesViewed} dimensions {${dimension}}}`).join('\n')} } }
  }`;
}
export function streamRows(rows, dimension, complete = false) {
  if (!Array.isArray(rows) || (complete && rows.length >= 1000)) throw Error('Incomplete Stream analytics.');
  return rows.map(row => {
    const label = row.dimensions?.[dimension];
    if (typeof label !== 'string' || (dimension === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(label))) throw Error('Incompatible Stream analytics dimension.');
    return { label, minutes: count(row.sum?.minutesViewed) };
  });
}
export async function main() {
  try {
    const [dist, profile, account, kind, hoursText, host = ''] = process.argv.slice(1);
    const hours = Number(hoursText);
    if (!/^[a-f0-9]{32}$/i.test(account) || !profile || profile.startsWith('-') || !['account','web','stream'].includes(kind) || ![24,168].includes(hours) || host.length > 253) throw Error('Invalid analytics context.');
    if (kind === 'stream' && host && !/^[a-f0-9]{32}$/i.test(host)) throw Error('Invalid analytics context.');
    const { p: setProfile, s: getToken } = await import(new URL('oauth-D6EZEBcY.mjs', pathToFileURL(dist + '/')));
    setProfile(profile);
    const token = await getToken();
    if (!token) throw Error('Sign in again to load analytics.');
    const deadline = AbortSignal.timeout(85000);
    async function request(path, body) {
      const response = await fetch('https://api.cloudflare.com/client/v4' + path, {
        method: body ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type':'application/json' },
        ...(body ? {body: JSON.stringify(body)} : {}), redirect: 'error',
        signal: AbortSignal.any([deadline, AbortSignal.timeout(20000)]),
      });
      if (!response.ok) throw Error(`Analytics unavailable (HTTP ${response.status}). Check Analytics read permission and account access.`);
      const result = await response.json();
      if (result.errors?.length || result.success === false) throw Error('Cloudflare could not provide these analytics. Check dataset access, Analytics read permission, and plan retention limits.');
      return result;
    }
    const end = new Date(Math.floor(Date.now()/3600000)*3600000);
    const start = new Date(end.getTime() - hours*3600000);
    const period = {start: start.toISOString(), end: end.toISOString()};
    if (kind === 'account') {
      const zones = [];
      for (let page = 1; ; page++) {
        const result = await request(`/zones?account.id=${account}&per_page=50&page=${page}`);
        if (!Array.isArray(result.result) || result.result.some(z => typeof z.id !== 'string' || typeof z.name !== 'string' || z.account?.id !== account)) throw Error('Zone list is incompatible with the selected account.');
        zones.push(...result.result);
        if (result.result.length < 50 || page >= result.result_info?.total_pages) break;
        if (page >= 100) throw Error('Account has too many zones for a complete report.');
      }
      const result = await collectAccount(zones, async zone => {
        const response = await request('/graphql', {query: `query AccountTraffic($zone: string!, $start: Time!, $end: Time!) {viewer { zones(filter:{zoneTag:$zone}) { httpRequests1hGroups(limit:1000, filter:{datetime_geq:$start, datetime_lt:$end}, orderBy:[datetime_ASC]) {dimensions {datetime} sum {requests bytes cachedRequests threats}} }}}`, variables:{zone, ...period}});
        const groups = response.data?.viewer?.zones;
        if (!Array.isArray(groups) || groups.length !== 1) throw Error('Zone analytics unavailable.');
        return groups[0].httpRequests1hGroups;
      });
      console.log(JSON.stringify({...period, ...result}));
    } else if (kind === 'stream') {
      const response = await request('/graphql', {query:streamQuery(host), variables:{account,...period,...(host ? {video:host} : {})}});
      const accounts = response.data?.viewer?.accounts;
      if (!Array.isArray(accounts) || accounts.length !== 1) throw Error('Cloudflare could not provide Stream analytics for this account.');
      const data = accounts[0];
      console.log(JSON.stringify({...period, series:streamRows(data.series,'date',true), videos:streamRows(data.videos,'uid'), countries:streamRows(data.countries,'clientCountryName')}));
    } else {
      const response = await request('/graphql', {query:webQuery(host), variables:{account,...period,...(host ? {host} : {})}});
      const accounts = response.data?.viewer?.accounts;
      if (!Array.isArray(accounts) || accounts.length !== 1) throw Error('Web analytics unavailable for this account.');
      const data = accounts[0];
      console.log(JSON.stringify({...period, series: webRows(data.series,'datetimeHour',true), hosts: webRows(data.hosts,'requestHost'), paths: webRows(data.paths,'requestPath'), referrers: webRows(data.referrers,'refererHost'), countries: webRows(data.countries,'countryName'), browsers: webRows(data.browsers,'userAgentBrowser')}));
    }
  } catch (error) {
    // Only deliberately authored diagnostics are allowed across the process boundary.
    const message = error instanceof Error ? error.message : '';
    console.error(/^(Invalid analytics context|Sign in again|Analytics unavailable \(HTTP|Cloudflare could not|Zone list is incompatible|Account has too many|Web analytics unavailable|Incomplete |Incompatible |Invalid analytics timestamp)/.test(message) ? message : 'Unable to load analytics. Check your connection and account permissions.');
    process.exitCode = 1;
  }
}
