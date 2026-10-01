import { pathToFileURL } from 'node:url';

// Deliberately fixed read operations: callers cannot choose an API URL or method.
export function readRequest(account, kind, options, now = Date.now()) {
  if (!/^[a-f0-9]{32}$/i.test(account)) throw Error('Select a valid account.');
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw Error('Invalid options.');
  if (kind === 'tokens') {
    const page = options.page ?? 1;
    if (!Number.isInteger(page) || page < 1 || page > 10000) throw Error('Invalid page.');
    return { path: `/accounts/${account}/tokens?page=${page}&per_page=20&include_expired=true` };
  }
  if (kind === 'agents') {
    const { hours = 24, end = now, cursor = '', search = '' } = options;
    if (![1, 24, 72, 168].includes(hours) || !Number.isSafeInteger(end) || end > now + 60000 || end < now - 8 * 86400000 || typeof cursor !== 'string' || cursor.length > 2048 || typeof search !== 'string' || search.length > 200) throw Error('Invalid trace options.');
    return { path: `/accounts/${account}/workers/observability/telemetry/query`, body: {
      queryId: 'flareops-agent-traces', dry: true, view: 'agents', limit: 20,
      timeframe: { from: end - hours * 3600000, to: end },
      parameters: { ...(search ? { needle: { value: search, isRegex: false, matchCase: false } } : {}) },
      ...(cursor ? { offset: cursor, offsetDirection: 'next' } : {}),
    }};
  }
  throw Error('Unsupported read operation.');
}
const string = value => typeof value === 'string' ? value : '';
const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
export function readResult(kind, envelope) {
  const raw = envelope?.result;
  const rows = kind === 'tokens' ? raw : raw?.agents;
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== 'object' || typeof row.id !== 'string')) throw Error('Cloudflare returned an incompatible response.');
  // Allowlist metadata; token values, policies, and arbitrary payloads never leave the subprocess.
  const items = rows.map(row => kind === 'tokens' ? {
    id: row.id, name: string(row.name) || row.id, status: string(row.status),
    issued: string(row.issued_on), expires: string(row.expires_on), lastUsed: string(row.last_used_on),
  } : {
    id: row.id, name: string(row.agentName) || string(row.agentId) || string(row.traceId),
    status: string(row.status), traceId: string(row.traceId),
    started: number(row.traceStartMs), duration: number(row.traceDurationMs),
    inputTokens: number(row.inputTokens), outputTokens: number(row.outputTokens),
    models: Array.isArray(row.models) ? row.models.filter(v => typeof v === 'string') : [],
    services: Array.isArray(row.services) ? row.services.filter(v => typeof v === 'string') : [],
    spans: number(row.spans),
  });
  const info = envelope.result_info;
  const hasNext = kind === 'tokens' && Number.isFinite(info?.total_count) && Number.isFinite(info?.page) && Number.isFinite(info?.per_page)
    ? info.page * info.per_page < info.total_count : rows.length >= 20;
  return { items, hasNext, nextCursor: kind === 'agents' && hasNext ? rows.at(-1).id : null };
}
export async function executeRead(account, kind, options, request) {
  const spec = readRequest(account, kind, options);
  return readResult(kind, await request(spec));
}
export async function main() {
  try {
    const [dist, profile, account, kind, input] = process.argv.slice(1);
    if (!profile || profile.startsWith('-') || /[\x00-\x1f]/.test(profile)) throw Error('Select a valid profile.');
    const options = JSON.parse(input);
    readRequest(account, kind, options);
    const { p: setProfile, s: getToken } = await import(new URL('oauth-D6EZEBcY.mjs', pathToFileURL(dist + '/')));
    setProfile(profile);
    const token = await getToken();
    if (!token) throw Error('Sign in again to load this page.');
    const result = await executeRead(account, kind, options, async ({ path, body }) => {
      const response = await fetch('https://api.cloudflare.com/client/v4' + path, {
        method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const permission = kind === 'tokens' ? 'Account API Tokens Read' : 'Workers Observability Write';
      if (!response.ok) throw Error(`Cloudflare returned HTTP ${response.status}. Check ${permission} permission and account access.`);
      const data = await response.json();
      if (data.success === false || data.errors?.length) throw Error(`Cloudflare could not load this page. Check ${permission} permission and account access.`);
      return data;
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unable to load account data.');
    process.exitCode = 1;
  }
}
