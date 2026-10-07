import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deploymentConfig, installId, setupBackend } from '../src-tauri/src/cf/harness-setup.mjs';
const account = 'a'.repeat(32), token = 'b'.repeat(64);
const base = `/accounts/${account}`;
function fixture(existing = null) {
  const calls = [];
  const responses = {
    [base]: { id: account },
    [`${base}/workers/subdomain`]: { subdomain: 'personal' },
    [`${base}/workers/scripts/flareops-harness/settings`]: existing,
    [`${base}/artifacts/namespaces/default`]: null,
  };
  return { calls, options: { account, token,
    request: async path => { calls.push(path); assert.ok(path in responses); return responses[path]; },
    docker: async () => { calls.push('docker'); }, deploy: async () => { calls.push('deploy'); },
    progress: () => {}, health: async () => true,
  } };
}
test('sets up selected account, checks prerequisites before deployment, verifies connection', async () => {
  const { options, calls } = fixture();
  assert.deepEqual(await setupBackend(options), { endpoint: 'https://flareops-harness.personal.workers.dev', accountId: account, connected: true });
  assert.ok(calls.indexOf('docker') < calls.indexOf('deploy'));
  assert.ok(calls.indexOf(`${base}/artifacts/namespaces/default`) < calls.indexOf('deploy'));
});
test('will not overwrite an existing unrecognized installation or rotate its token', async () => {
  const { options, calls } = fixture({ bindings: [{ name: 'ACCOUNT_ID', type: 'plain_text', text: account }] });
  await assert.rejects(setupBackend(options), /another installation/);
  assert.ok(!calls.includes('deploy'));
});
test('reconnects its own healthy installation without deploying or requiring Docker', async () => {
  const { options, calls } = fixture({ bindings: [
    { name: 'ACCOUNT_ID', type: 'plain_text', text: account },
    { name: 'FLAREOPS_INSTALL_ID', type: 'plain_text', text: installId(token) },
  ] });
  assert.equal((await setupBackend(options)).connected, true);
  assert.ok(!calls.includes('deploy'));
  assert.ok(!calls.includes('docker'));
});
test('resumes partial deployment using the same installation credential', async () => {
  const { options, calls } = fixture({ bindings: [
    { name: 'ACCOUNT_ID', type: 'plain_text', text: account },
    { name: 'FLAREOPS_INSTALL_ID', type: 'plain_text', text: installId(token) },
  ] });
  options.health = async (_endpoint, retry) => !!retry;
  await setupBackend(options);
  assert.equal(calls.filter(call => call === 'deploy').length, 1);
});
test('Docker failure and account mismatch stop before any deployment', async () => {
  const { options, calls } = fixture();
  options.docker = async () => { throw Error('Docker missing'); };
  await assert.rejects(setupBackend(options), /Docker/);
  assert.ok(!calls.includes('deploy'));
  options.request = async () => ({ id: 'c'.repeat(32) });
  await assert.rejects(setupBackend(options), /cannot access/);
  assert.ok(!calls.includes('deploy'));
});
test('failed health verification never reports connected', async () => {
  const { options } = fixture(); options.health = async () => false;
  await assert.rejects(setupBackend(options), /not responding/);
});
test('deployment config fixes account, script and paths without putting token in vars', async () => {
  const template = JSON.parse(await readFile(new URL('../harness/wrangler.jsonc', import.meta.url)));
  const config = deploymentConfig(template, '/bundled/harness', account, token);
  assert.equal(config.account_id, account);
  assert.equal(config.vars.ACCOUNT_ID, account);
  assert.equal(config.vars.FLAREOPS_INSTALL_ID, installId(token));
  assert.equal(config.main, '/bundled/harness/src/index.ts');
  assert.deepEqual(config.routes, []);
  assert.ok(config.containers.every(c => c.image === '/bundled/harness/Dockerfile'));
  assert.ok(!JSON.stringify(config).includes(token));
  assert.throws(() => deploymentConfig(template, '/bundled', '../wrong', token));
});
test('explicit upgrade redeploys a recognized healthy installation', async () => {
  const { options, calls } = fixture({ bindings: [
    { name: 'ACCOUNT_ID', type: 'plain_text', text: account },
    { name: 'FLAREOPS_INSTALL_ID', type: 'plain_text', text: installId(token) },
  ] });
  await setupBackend({ ...options, upgrade: true });
  assert.ok(calls.includes('deploy'));
});
