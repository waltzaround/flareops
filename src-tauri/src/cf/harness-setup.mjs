import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, delimiter, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
export const installId = token => createHash('sha256').update(token).digest('hex');
export function deploymentConfig(template, root, account, token) {
  if (!/^[a-f0-9]{32}$/i.test(account) || !/^[a-f0-9]{64}$/.test(token)) throw Error('Invalid setup context.');
  return { ...template, name: 'flareops-harness', account_id: account, main: join(root, 'src/index.ts'),
    workers_dev: true, routes: [], vars: { ...template.vars, ACCOUNT_ID: account, FLAREOPS_INSTALL_ID: installId(token) },
    containers: template.containers.map(container => ({ ...container, image: join(root, 'Dockerfile') })),
  };
}
export async function setupBackend({ account, token, request, docker, deploy, progress, health, upgrade = false }) {
  if (!/^[a-f0-9]{32}$/i.test(account) || !/^[a-f0-9]{64}$/.test(token)) throw Error('Invalid setup context.');
  progress('Checking signed-in account');
  const base = `/accounts/${account}`;
  if ((await request(base))?.id !== account) throw Error('The signed-in profile cannot access this account.');
  const subdomain = (await request(`${base}/workers/subdomain`))?.subdomain;
  if (typeof subdomain !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain)) throw Error('Enable a workers.dev subdomain in this Cloudflare account, then retry setup.');
  const endpoint = `https://flareops-harness.${subdomain}.workers.dev`;
  const existing = await request(`${base}/workers/scripts/flareops-harness/settings`, true);
  if (existing) {
    const bindings = existing.bindings || [];
    if (!bindings.some(b => b.name === 'FLAREOPS_INSTALL_ID' && b.type === 'plain_text' && b.text === installId(token))
        || !bindings.some(b => b.name === 'ACCOUNT_ID' && b.type === 'plain_text' && b.text === account)) {
      throw Error('A backend already exists and belongs to another installation. Use Advanced connection with its existing token; setup will not replace it.');
    }
    if (await health(endpoint) && !upgrade) return { endpoint, accountId: account, connected: true };
  }
  progress('Checking Docker');
  await docker();
  progress('Checking Artifacts access');
  // Artifacts creates the default namespace on the first repository creation.
  await request(`${base}/artifacts/namespaces/default`, true);
  progress('Deploying backend and configuring credentials');
  await deploy();
  progress('Verifying backend connection');
  if (!await health(endpoint, true)) throw Error('Deployment finished, but the backend is not responding yet. Retry setup to reconnect using the saved credentials.');
  return { endpoint, accountId: account, connected: true };
}
export async function main() {
  let temporary;
  try {
    const [dist, root, profile, account] = process.argv.slice(1);
    if (!/^[a-zA-Z0-9_][a-zA-Z0-9_-]{0,63}$/.test(profile || '')) throw Error('Select a named Cloudflare profile.');
    let input = '';
    for await (const chunk of process.stdin) { input += chunk; if (input.length > 1024) throw Error('Invalid setup context.'); }
    const { token, upgrade = false } = JSON.parse(input);
    if (typeof upgrade !== "boolean") throw Error("Invalid setup context.");
    if (!/^[a-f0-9]{64}$/.test(token)) throw Error('Invalid setup context.');
    const { p: setProfile, s: getToken } = await import(new URL('oauth-D6EZEBcY.mjs', pathToFileURL(dist + '/')));
    setProfile(profile);
    const credential = await getToken();
    if (!credential) throw Error('Sign in to Cloudflare again.');
    const template = JSON.parse(await readFile(join(root, 'wrangler.jsonc'), 'utf8'));
    const config = deploymentConfig(template, root, account, token);
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(CLOUDFLARE_|CF_|WRANGLER_|NODE_OPTIONS$|NODE_PATH$)/.test(key)));
    Object.assign(env, { PATH: [dirname(process.execPath), '/usr/local/bin', '/opt/homebrew/bin', '/Applications/Docker.app/Contents/Resources/bin', env.PATH || ''].join(delimiter),
      CLOUDFLARE_API_TOKEN: credential, CLOUDFLARE_ACCOUNT_ID: account,
      CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false', CI: '1', NO_COLOR: '1', WRANGLER_SEND_METRICS: 'false' });
    const result = await setupBackend({ account, token, upgrade,
      progress: message => console.log(JSON.stringify({ progress: message })),
      request: async (path, allowMissing = false) => {
        const response = await fetch('https://api.cloudflare.com/client/v4' + path, {
          headers: { Authorization: `Bearer ${credential}` }, redirect: 'error', signal: AbortSignal.timeout(20000),
        });
        if (allowMissing && response.status === 404) return null;
        if (!response.ok) throw Error(`Cloudflare returned HTTP ${response.status}. Check account access and permissions for Workers, Containers and Artifacts.`);
        const data = await response.json();
        if (!data.success || data.errors?.length) throw Error('Cloudflare could not verify account access.');
        return data.result;
      },
      docker: async () => {
        try { await exec('docker', ['info', '--format', '{{.ServerVersion}}'], { env: { ...env, CLOUDFLARE_API_TOKEN: '' }, timeout: 20000 }); }
        catch { throw Error('Docker is required to build the agent environment. Install and start Docker, then retry setup.'); }
      },
      deploy: async () => {
        temporary = await mkdtemp(join(tmpdir(), 'flareops-setup-'));
        const configPath = join(temporary, 'wrangler.json');
        const secretsPath = join(temporary, 'secrets.json');
        await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
        await writeFile(secretsPath, JSON.stringify({ HARNESS_TOKEN: token }), { mode: 0o600 });
        env.WRANGLER_LOG_PATH = join(temporary, 'wrangler.log');
        try {
          await exec(process.execPath, [join(root, 'node_modules/wrangler/bin/wrangler.js'), 'deploy', '--config', configPath, '--secrets-file', secretsPath],
            { cwd: temporary, env, timeout: 20 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 });
        } catch { throw Error('Backend deployment failed. Check Docker is running and this login has Workers, Containers, Artifacts and Workers AI access. Any partial resources and saved credentials are retained for retry.'); }
      },
      health: async (endpoint, retry = false) => {
        for (let attempt = 0; attempt < (retry ? 12 : 1); attempt++) {
          try {
            const response = await fetch(endpoint + '/health', { headers: { Authorization: `Bearer ${token}`, 'X-FlareOps-Account': account, 'X-FlareOps-Profile': profile }, redirect: 'error', signal: AbortSignal.timeout(10000) });
            if (response.ok) { const data = await response.json(); if (data.accountId === account && data.version === 1) return true; }
          } catch {}
          if (retry) await new Promise(resolve => setTimeout(resolve, 5000));
        }
        return false;
      },
    });
    console.log(JSON.stringify({ result }));
  } catch (error) {
    const message = error instanceof Error && /^(Invalid setup |Select |Sign in |The signed-in |Enable a |A backend |Docker is |Cloudflare |Backend deployment |Deployment finished)/.test(error.message)
      ? error.message : 'Backend setup failed. Verify the bundled runtime and retry.';
    console.log(JSON.stringify({ error: message }));
    process.exitCode = 1;
  } finally {
    if (temporary) await rm(temporary, { recursive: true, force: true });
  }
}
