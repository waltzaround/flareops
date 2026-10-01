import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectCrons } from '../src-tauri/src/cf/worker-crons.mjs';

test('collects every schedule, including Workers beyond the first ten, with bounded concurrency', async () => {
  let active = 0, peak = 0;
  const result = await collectCrons(async path => {
    if (!path) return Array.from({length: 55}, (_, i) => ({id: `worker-${i}`}));
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 1));
    active--;
    return {schedules: [{cron: '0 2 * * *'}, {cron: '*/15 * * * *'}]};
  });
  assert.equal(result.workers, 55);
  assert.equal(result.schedules.length, 110);
  assert.equal(result.failures.length, 0);
  assert.ok(peak <= 4);
});
test('keeps failed and incompatible Workers separate from empty schedules', async () => {
  const result = await collectCrons(async path => {
    if (!path) return ['ok', 'empty', 'failed', 'invalid'].map(id => ({id}));
    if (path === '/failed/schedules') throw Error('private details');
    if (path === '/invalid/schedules') return {};
    return {schedules: path === '/ok/schedules' ? [{cron: '* * * * *'}] : []};
  });
  assert.deepEqual(result.failures, ['failed', 'invalid']);
  assert.equal(result.schedules.length, 1);
  assert.equal(result.workers, 4);
});
test('rejects malformed list instead of reporting no schedules', async () => {
  await assert.rejects(() => collectCrons(async () => [{}]));
  assert.deepEqual(await collectCrons(async () => []), {schedules: [], failures: [], workers: 0});
});

test('matches history by Worker and cron; never guesses a run from its schedule', async () => {
  const { attachHistory } = await import('../src-tauri/src/cf/worker-crons.mjs');
  const schedules = ['daily', 'monthly', 'denied', 'wrong'].map(worker => ({worker, cron:'0 2 * * *'}));
  const result = await attachHistory({schedules}, async ({worker, cron}) => {
    if (worker === 'denied') throw Error();
    if (worker === 'monthly') return [];
    return [{scriptName: worker === 'wrong' ? 'other' : worker, cron, datetime:'2026-10-01T02:00:01Z',status:'exception'}];
  }, new Date('2026-10-01T09:00:00Z'));
  assert.deepEqual(result.schedules[0].lastRun, {at:'2026-10-01T02:00:01Z',status:'exception'});
  assert.equal(result.schedules[1].historyAvailable, true);
  assert.equal(result.schedules[1].lastRun, null);
  assert.equal(result.schedules[2].historyAvailable, false);
  assert.equal(result.schedules[3].historyAvailable, false);
  assert.equal(result.historyStart, '2026-09-24T09:00:00.000Z');
});
