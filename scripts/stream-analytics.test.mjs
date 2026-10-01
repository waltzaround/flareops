import test from 'node:test';
import assert from 'node:assert/strict';
import { streamQuery, streamRows } from '../src-tauri/src/cf/site-analytics.mjs';
test('Stream uses independent daily and ranked groups and binds video as a variable', () => {
  const query = streamQuery('private-video');
  assert.ok(query.includes('$video: string!'));
  assert.ok(query.includes('uid: $video'));
  assert.ok(!query.includes('private-video'));
  assert.ok(query.includes('series: streamMinutesViewedAdaptiveGroups(limit: 1000'));
  assert.ok(query.includes('videos: streamMinutesViewedAdaptiveGroups(limit: 100'));
  assert.ok(query.includes('countries: streamMinutesViewedAdaptiveGroups(limit: 100'));
  assert.ok(!streamQuery('').includes('$video'));
});
test('Stream rejects missing, negative and incomplete totals without inventing zeros', () => {
  assert.deepEqual(streamRows([{dimensions:{date:'2026-10-01'},sum:{minutesViewed:3.5}}], 'date', true), [{label:'2026-10-01', minutes:3.5}]);
  assert.deepEqual(streamRows([], 'date', true), []);
  for (const input of [null, [{dimensions:{date:'2026-10-01'},sum:{}}], [{dimensions:{date:'2026-10-01'},sum:{minutesViewed:-1}}], Array(1000).fill({})]) assert.throws(() => streamRows(input, 'date', true));
});
