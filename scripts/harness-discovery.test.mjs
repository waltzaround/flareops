import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverBackend } from '../src-tauri/src/cf/harness-discovery.mjs';
const account = 'a'.repeat(32);
const root = `/accounts/${account}`;
function requestWith(overrides = {}) {
  const responses = {
    [root]: { id: account },
    [`${root}/workers/scripts/flareops-harness/settings`]: { bindings: [
      { name: 'ACCOUNT_ID', type: 'plain_text', text: account },
      { name: 'AI', type: 'ai' }, { name: 'PROJECTS', type: 'durable_object_namespace' },
    ] },
    [`${root}/workers/scripts/flareops-harness/subdomain`]: { enabled: true },
    [`${root}/workers/subdomain`]: { subdomain: 'personal' },
    ...overrides,
  };
  return async path => { assert.ok(path in responses); return responses[path]; };
}
test('discovers only the selected account backend', async () => {
  assert.deepEqual(await discoverBackend(account, requestWith()), {
    status: 'found', accountId: account, endpoint: 'https://flareops-harness.personal.workers.dev',
  });
});
test('account mismatch stops discovery before querying any worker', async () => {
  let calls = 0;
  await assert.rejects(discoverBackend(account, async () => { calls++; return { id: 'b'.repeat(32) }; }));
  assert.equal(calls, 1);
});
test('missing backend and custom routing are explicit states', async () => {
  assert.equal((await discoverBackend(account, requestWith({ [`${root}/workers/scripts/flareops-harness/settings`]: null }))).status, 'missing');
  assert.equal((await discoverBackend(account, requestWith({ [`${root}/workers/scripts/flareops-harness/subdomain`]: { enabled: false } }))).status, 'custom-domain');
});
test('refuses unrelated scripts and injected endpoint hosts', async () => {
  await assert.rejects(discoverBackend(account, requestWith({ [`${root}/workers/scripts/flareops-harness/settings`]: { bindings: [] } })));
  await assert.rejects(discoverBackend(account, requestWith({ [`${root}/workers/subdomain`]: { subdomain: 'evil.com/path' } })));
  await assert.rejects(discoverBackend('../other', requestWith()));
});
