// Fixed Cloudflare management operations; never accepts arbitrary URLs or credentials.
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const enc = encodeURIComponent;
const assert = (condition, message) => { if (!condition) throw Error(message); };
const name = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const pick = (value, keys) => Object.fromEntries(keys.filter(k => value?.[k] !== undefined).map(k => [k, value[k]]));

export function settingsView(product, value) {
  if (product === 'Pages') return {
    production_branch: value.production_branch ?? '',
    build_config: pick(value.build_config, ['build_command', 'destination_dir', 'root_dir']),
  };
  return pick(value, ['compatibility_date', 'compatibility_flags', 'limits', 'observability']);
}
export function validateSettings(product, input) {
  assert(input && typeof input === 'object' && !Array.isArray(input), 'Invalid settings.');
  const allowed = product === 'Pages' ? ['production_branch', 'build_config'] : ['compatibility_date', 'compatibility_flags', 'limits', 'observability'];
  assert(Object.keys(input).length && Object.keys(input).every(k => allowed.includes(k)), 'Unsupported settings.');
  if ('production_branch' in input) assert(typeof input.production_branch === 'string' && input.production_branch.length > 0 && input.production_branch.length <= 256, 'Enter a production branch.');
  if ('build_config' in input) {
    assert(input.build_config && Object.keys(input.build_config).every(k => ['build_command','destination_dir','root_dir'].includes(k) && typeof input.build_config[k] === 'string' && input.build_config[k].length <= 2000), 'Invalid build settings.');
  }
  if ('compatibility_date' in input) assert(/^\d{4}-\d{2}-\d{2}$/.test(input.compatibility_date) && new Date(input.compatibility_date).toISOString().slice(0,10) === input.compatibility_date, 'Enter a valid compatibility date.');
  if ('compatibility_flags' in input) assert(Array.isArray(input.compatibility_flags) && input.compatibility_flags.every(v => typeof v === 'string' && /^[a-z0-9_]+$/.test(v)), 'Invalid compatibility flags.');
  if ('limits' in input) assert(input.limits && Object.keys(input.limits).join() === 'cpu_ms' && Number.isInteger(input.limits.cpu_ms) && input.limits.cpu_ms > 0 && input.limits.cpu_ms <= 300000, 'CPU limit must be between 1 and 300000 ms.');
  if ('observability' in input) assert(input.observability && Object.keys(input.observability).join() === 'enabled' && typeof input.observability.enabled === 'boolean', 'Invalid observability setting.');
  return input;
}
export async function management(api, account, request, mode, expected) {
  assert(/^[a-f0-9]{32}$/i.test(account), 'Select a valid account.');
  const { product, resource, section, action, values = {} } = request;
  assert(['Worker','Pages'].includes(product) && name(resource), 'Invalid resource.');
  const root = `/accounts/${account}`;
  const base = product === 'Pages' ? `${root}/pages/projects/${enc(resource)}` : `${root}/workers/scripts/${enc(resource)}`;
  const list = async path => {
    const all = [], seen = new Set();
    for (let page = 1; page <= 1000; page++) {
      const b = await api(`${path}${path.includes('?') ? '&' : '?'}page=${page}&per_page=${path.includes('/pages/') ? 10 : 50}`);
      assert(Array.isArray(b.result), 'Cloudflare returned an incompatible list.');
      if (!b.result.length) return all;
      const fresh = b.result.filter(x => !seen.has(x.id ?? x.name));
      assert(fresh.length, 'Cloudflare returned repeated pages.');
      fresh.forEach(x => seen.add(x.id ?? x.name)); all.push(...fresh);
      if (!b.result_info || page >= b.result_info.total_pages || (b.result_info.total_count !== undefined && all.length >= b.result_info.total_count)) return all;
    }
    throw Error('Cloudflare list is incomplete.');
  };
  const get = async path => (await api(path)).result;
  let operations = [], before, after, warning = '';
  if (section === 'settings') {
    const path = product === 'Pages' ? base : `${base}/settings`;
    const current = await get(path);
    const view = settingsView(product, current);
    if (mode === 'read') return { settings: view };
    assert(action === 'settings', 'Invalid settings action.');
    const patch = validateSettings(product, values);
    before = Object.fromEntries(Object.keys(patch).map(k => [k, view[k] ?? null]));
    after = patch;
    const body = { ...patch };
    if (product === 'Pages' && patch.build_config) body.build_config = { ...current.build_config, ...patch.build_config };
    if (product === 'Worker' && patch.observability) body.observability = { ...current.observability, ...patch.observability };
    if (product === 'Worker' && patch.limits) body.limits = { ...current.limits, ...patch.limits };
    operations.push({ path, method: 'PATCH', body, multipart: product === 'Worker' });
    warning = product === 'Worker' ? 'Changes affect the deployed Worker. A later deployment may overwrite these settings.' : 'Build settings apply to future deployments. Changing the production branch affects future production builds.';
  } else {
    assert(section === 'domains', 'Invalid management section.');
    const domains = await list(product === 'Pages' ? `${base}/domains` : `${root}/workers/domains`);
    if (mode === 'read') {
      const zones = await list(`/zones?account.id=${account}`);
      let targets;
      if (product === 'Worker') {
        const scripts = await get(`${root}/workers/scripts`);
        assert(Array.isArray(scripts), 'Worker list unavailable.');
        targets = scripts.map(s => ({ label: s.id, value: s.id }));
      } else {
        const project = await get(base);
        const deployments = await list(`${base}/deployments`);
        const aliases = new Map();
        for (const d of deployments) {
          if (d.environment !== 'preview' || d.latest_stage?.status !== 'success') continue;
          const branch = d.deployment_trigger?.metadata?.branch;
          if (!branch) continue;
          const aliasName = branch.toLowerCase().replace(/[^a-z0-9-]/g, '-');
          const target = `${aliasName}.${project.subdomain}`;
          if (d.aliases?.some(a => a === `https://${target}` || a === target)) aliases.set(target, {label: branch, value: target});
        }
        targets = [{ label: `Production (${project.production_branch || 'default'})`, value: project.subdomain }, ...aliases.values()];
      }
      const visible = product === 'Pages' ? domains : domains.filter(d => d.service === resource);
      const rows = [];
      for (const d of visible) {
        const hostname = d.hostname ?? d.name;
        const zone = zones.filter(z => hostname === z.name || hostname.endsWith(`.${z.name}`)).sort((a,b) => b.name.length - a.name.length)[0];
        let target = product === 'Worker' ? d.service : '', dnsAvailable = true;
        if (product === 'Pages' && zone) {
          try { const records = await list(`/zones/${zone.id}/dns_records?name=${enc(hostname)}`); target = records.find(r => r.type === 'CNAME')?.content ?? ''; } catch { dnsAvailable = false; }
        }
        rows.push({ id:d.id ?? hostname, hostname, target, environment:d.environment ?? '', zoneId:zone?.id ?? d.zone_id ?? '', status:d.status ?? 'Attached', dnsAvailable });
      }
      return { domains: rows, zones:zones.map(z => ({id:z.id,name:z.name})), targets };
    }
    assert(['attach','remove'].includes(action), 'Invalid domain action.');
    const hostname = String(values.hostname ?? '').trim().toLowerCase();
    assert(hostname.length <= 253 && hostname.includes('.') && hostname.split('.').every(x => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(x)), 'Enter a hostname without a protocol or path.');
    const existing = domains.find(d => (d.hostname ?? d.name) === hostname);
    if (action === 'remove') {
      assert(existing && (product === 'Pages' || existing.service === resource), 'Domain is no longer attached to this resource.');
      before = pick(existing, ['hostname','name','service','environment','status']); after = { removed:hostname };
      operations.push({method:'DELETE',path: product === 'Pages' ? `${base}/domains/${enc(hostname)}` : `${root}/workers/domains/${enc(existing.id)}`});
      warning = 'Traffic to this hostname will stop reaching this resource. For Pages, its DNS record is retained.';
    } else {
      assert(/^[a-f0-9]{32}$/i.test(values.zoneId), 'Select a zone in this account.');
      const zone = await get(`/zones/${values.zoneId}`);
      assert(zone.account?.id === account && (hostname === zone.name || hostname.endsWith(`.${zone.name}`)), 'Domain must belong to the selected account and zone.');
      if (product === 'Worker') {
        assert(name(values.target), 'Select a deployed Worker.');
        const scripts = await get(`${root}/workers/scripts`);
        assert(Array.isArray(scripts) && scripts.some(s => s.id === values.target), 'Target Worker does not exist in this account.');
        before = existing ? pick(existing, ['hostname','service','environment']) : null;
        after = { hostname, service:values.target, zone_id:zone.id };
        operations.push({method:'PUT',path:`${root}/workers/domains`,body:after});
        warning = 'This changes which Worker receives traffic for this hostname. Cloudflare manages its DNS and certificate.';
      } else {
        const project = await get(base);
        const target = String(values.target ?? '');
        assert(target === project.subdomain || (target.endsWith(`.${project.subdomain}`) && /^[a-z0-9-]+$/.test(target.slice(0, -(project.subdomain.length + 1)))), 'Select a production or deployed branch alias.');
        if (target !== project.subdomain) {
          const deployments = await list(`${base}/deployments`);
          assert(deployments.some(d => d.environment === 'preview' && d.latest_stage?.status === 'success' && d.aliases?.some(a => a === `https://${target}` || a === target)), 'Deploy the selected preview branch successfully first.');
          assert(existing?.status === 'active', 'Attach and activate this domain on production first, then select its preview branch.');
        }
        const records = await list(`/zones/${zone.id}/dns_records?name=${enc(hostname)}`);
        assert(records.length <= 1 && records.every(r => r.type === 'CNAME'), 'Conflicting DNS records exist. Resolve them in DNS before attaching this domain.');
        const record = records[0];
        before = { domain:existing ? pick(existing,['name','status']) : null, dns:record ? pick(record,['id','type','content','proxied','ttl']) : null };
        after = {hostname, target, proxied:true};
        if (!existing) operations.push({method:'POST',path:`${base}/domains`,body:{name:hostname}});
        operations.push({method:record ? 'PATCH' : 'POST',path:`/zones/${zone.id}/dns_records${record ? `/${enc(record.id)}` : ''}`,body:{type:'CNAME',name:hostname,content:target,proxied:true,ttl:1}});
        warning = 'This updates the Pages domain and its proxied DNS target. DNS propagation and certificate activation can take time. Multiple steps are not atomic.';
      }
    }
  }
  const plan = {before, after, warning};
  // Compare the exact proposed operations, including preserved configuration, before writing.
  const fingerprint = digest({before, operations});
  if (mode === 'prepare') return {...plan, fingerprint};
  assert(mode === 'apply' && fingerprint === expected, 'Configuration changed since review. Refresh and review again.');
  let completed = 0;
  try {
    for (const op of operations) { await api(op.path, op.method, op.body, op.multipart); completed++; }
  } catch (error) {
    throw Error(`${completed ? `${completed} step(s) applied; remaining changes failed. Refresh before retrying. ` : ''}${error.message}`);
  }
  return {success:true};
}
export function cliArguments(path, method, body, account) {
      const url = new URL(path, 'https://api.cloudflare.com');
      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      let args, paginated = false;
      if (parts[0] === 'accounts' && parts[2] === 'pages' && parts[3] === 'projects') {
        const project = parts[4];
        if (parts.length === 5) args = ['pages', method === 'PATCH' ? 'edit' : 'get', project];
        else if (parts[5] === 'domains') args = method === 'POST' ? ['pages','domains','create',project] : ['pages','domains',method === 'DELETE' ? 'delete' : 'list', ...(parts[6] ? [parts[6]] : []), '--project-name', project];
        else if (parts[5] === 'deployments') { args = ['pages','deployments','list','--project-name',project]; paginated = true; }
      } else if (parts[0] === 'zones') {
        if (parts.length === 1) { args = ['zones','list','--account-id',account]; paginated = true; }
        else if (parts.length === 2) args = ['zones','get','--zone',parts[1]];
        else if (parts[2] === 'dns_records') {
          args = ['dns','records', method === 'PATCH' ? 'edit' : method === 'POST' ? 'create' : 'list', ...(parts[3] ? [parts[3]] : []),'--zone',parts[1]];
          if (url.searchParams.has('name')) args.push('--name',url.searchParams.get('name'));
          paginated = method === 'GET';
        }
      }
      if (args) {

        if (paginated) for (const key of ['page','per_page']) if (url.searchParams.has(key)) args.push('--'+key.replace('_','-'),url.searchParams.get(key));
        if (body) args.push('--body',JSON.stringify(body));
        if (method === 'DELETE') args.push('--force');
      }
      return {args,paginated};
}
export async function main() {
  try {
    const [dist, profile, account, mode, raw, expected] = process.argv.slice(1);
    assert(profile && !profile.startsWith('-'), 'Select a profile.');
    const {p:setProfile,s:getToken} = await import(new URL('oauth-D6EZEBcY.mjs',pathToFileURL(dist+'/')));
    setProfile(profile); const token = await getToken(); assert(token, 'Sign in again.');
    const exec = promisify(execFile);
    const cli = async (args) => {
      try {
        const {stdout} = await exec(process.execPath, [resolve(dist,'../bin/cf'), ...args, '--profile', profile], {
          env:{...process.env, CLOUDFLARE_ACCOUNT_ID:account, CI:'1',NO_COLOR:'1',WRANGLER_SEND_METRICS:'false'},
          timeout:30000, maxBuffer:8*1024*1024,
        });
        return stdout.trim() ? JSON.parse(stdout) : null;
      } catch { throw Error('Cloudflare CLI request failed. Check permissions and configuration; refresh before retrying changes.'); }
    };
    const api = async (path, method = 'GET', body, multipart = false) => {
      // Use the bundled CLI for the endpoints present in its beta.8 schema catalog.
      const {args,paginated} = cliArguments(path,method,body,account);
      if (args) {
        const result = await cli(args);
        return {success:true,result, ...(paginated ? {result_info:{total_pages:1000}} : {})};
      }
      let data;
      if (multipart) { data = new FormData(); data.set('settings', new Blob([JSON.stringify(body)], {type:'application/json'})); }
      else if (body) data = JSON.stringify(body);
      let response;
      try { response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {method, body:data, headers:{Authorization:`Bearer ${token}`, ...(!multipart && body ? {'Content-Type':'application/json'} : {})}, redirect:'error',signal:AbortSignal.timeout(20000)}); }
      catch { throw Error('Cloudflare request failed or timed out. Refresh to check whether a change was applied.'); }
      const result = await response.json();
      assert(response.ok && result.success !== false, `Cloudflare rejected the request (HTTP ${response.status}; code ${result.errors?.[0]?.code ?? 'unknown'}). Check permissions and configuration.`);
      return result;
    };
    console.log(JSON.stringify(await management(api, account, JSON.parse(raw), mode, expected)));
  } catch (error) { console.error(error instanceof Error ? error.message : 'Management request failed.'); process.exitCode = 1; }
}
