import { pathToFileURL } from 'node:url';

// Only Cloudflare receives the signed-in profile's credential. Never send it
// to a discovered Worker, return it to the renderer, or include API payloads.
export async function discoverBackend(account, request) {
  if (!/^[a-f0-9]{32}$/i.test(account)) throw Error('Select a valid Cloudflare account.');
  const root = `/accounts/${account}`;
  const identity = await request(root);
  if (identity?.id !== account) throw Error('The signed-in profile cannot access this account.');
  const settings = await request(`${root}/workers/scripts/flareops-harness/settings`, true);
  if (!settings) return { status: 'missing', accountId: account };
  const bindings = settings.bindings;
  if (!Array.isArray(bindings) || !bindings.some(b => b.name === 'ACCOUNT_ID' && b.type === 'plain_text' && b.text === account)
      || !bindings.some(b => b.name === 'AI' && b.type === 'ai')
      || !bindings.some(b => b.name === 'PROJECTS' && b.type === 'durable_object_namespace')) {
    throw Error('The flareops-harness Worker does not match this account’s backend configuration.');
  }
  const route = await request(`${root}/workers/scripts/flareops-harness/subdomain`);
  if (route?.enabled !== true) return { status: 'custom-domain', accountId: account };
  const subdomain = (await request(`${root}/workers/subdomain`))?.subdomain;
  if (typeof subdomain !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain)) throw Error('Cloudflare returned an invalid Workers subdomain.');
  return { status: 'found', accountId: account, endpoint: `https://flareops-harness.${subdomain}.workers.dev` };
}
export async function main() {
  try {
    const [dist, profile, account] = process.argv.slice(1);
    if (!/^[a-zA-Z0-9_][a-zA-Z0-9_-]{0,63}$/.test(profile || '')) throw Error('Select a named Cloudflare profile.');
    const { p: setProfile, s: getToken } = await import(new URL('oauth-D6EZEBcY.mjs', pathToFileURL(dist + '/')));
    setProfile(profile);
    const token = await getToken();
    if (!token) throw Error('Sign in to Cloudflare again.');
    const result = await discoverBackend(account, async (path, allowMissing = false) => {
      const response = await fetch('https://api.cloudflare.com/client/v4' + path, {
        headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(20000),
      });
      if (allowMissing && response.status === 404) return null;
      if (!response.ok) throw Error(`Cloudflare returned HTTP ${response.status}. Check the signed-in profile’s account and Workers permissions.`);
      const data = await response.json();
      if (data.success !== true || data.errors?.length) throw Error('Cloudflare could not verify the backend.');
      return data.result;
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    // Do not echo SDK/network errors which can contain request credentials.
    const message = error instanceof Error && /^(Select |Sign in |Cloudflare |The signed-in |The flareops-)/.test(error.message)
      ? error.message : 'Unable to check the backend using the signed-in Cloudflare profile.';
    console.error(message);
    process.exitCode = 1;
  }
}
