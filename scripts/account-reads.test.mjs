import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readRequest, readResult, executeRead } from '../src-tauri/src/cf/account-reads.mjs';
const account = 'a'.repeat(32);
test('account reads reject arbitrary operations and invalid pagination before any request', async () => {
  for (const [kind, options] of [['delete', {}], ['tokens', { page: 0 }], ['agents', { hours: 999 }], ['agents', { cursor: 'x'.repeat(2049) }]]) {
    await assert.rejects(executeRead(account, kind, options, () => assert.fail('must not call API')));
  }
  assert.throws(() => readRequest('../other', 'tokens', {}));
});
test('token responses expose only metadata, never token values or policies', () => {
  const result = readResult('tokens', { result: [{ id: 'id', name: 'deploy', status: 'active', value: 'secret', policies: [{ secret: 'secret' }] }], result_info: { total_count: 21, page: 1, per_page: 20 } });
  assert.equal(result.hasNext, true);
  assert.equal(JSON.stringify(result).includes('secret'), false);
  assert.equal(result.items[0].name, 'deploy');
  assert.throws(() => readResult('tokens', {result: { changed: [] }}));
});
test('agent pagination keeps a stable time range and requests temporary agent queries', () => {
  const end = 1700000000000;
  const spec = readRequest(account, 'agents', { hours: 24, end, cursor: 'opaque', search: 'support' }, end);
  assert.equal(spec.path, `/accounts/${account}/workers/observability/telemetry/query`);
  assert.equal(spec.body.dry, true);
  assert.equal(spec.body.view, 'agents');
  assert.deepEqual(spec.body.timeframe, { from: end - 86400000, to: end });
  assert.equal(spec.body.offset, 'opaque');
  assert.deepEqual(spec.body.parameters.needle, { value: 'support', isRegex: false, matchCase: false });
});
test('empty, missing and paginated agent results remain distinct', () => {
  assert.equal(readResult('agents', {result: { agents: [] }}).hasNext, false);
  assert.throws(() => readResult('agents', {result: {}}));
  const agents = Array.from({ length: 20 }, (_, i) => ({ id: String(i), traceId: 'trace', inputTokens: 0, payload: 'private' }));
  const result = readResult('agents', { result: { agents } });
  assert.equal(result.nextCursor, '19');
  assert.equal(result.items[0].inputTokens, 0);
  assert.equal(result.items[0].outputTokens, null);
  assert.equal(JSON.stringify(result).includes('private'), false);
});
