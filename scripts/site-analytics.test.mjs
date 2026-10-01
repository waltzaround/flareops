import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectAccount, httpRows, webRows, webQuery } from '../src-tauri/src/cf/site-analytics.mjs';
const row = (requests=10) => ({dimensions:{datetime:'2026-10-01T01:00:00Z'},sum:{requests,bytes:100,cachedRequests:5,threats:1}});
test('account analytics combines zones without hiding unavailable zones', async () => {
  const result = await collectAccount([{id:'a',name:'a.example'},{id:'b',name:'b.example'},{id:'c',name:'c.example'}],async id => { if(id==='b') throw Error('permission'); return [row()]; });
  assert.equal(result.series[0].requests,20);
  assert.equal(result.series[0].cachedRequests,10);
  assert.equal(result.sites.length,2);
  assert.deepEqual(result.failures,['b.example']);
  assert.equal(result.totalZones,3);
});
test('malformed and capped data cannot become valid zero totals', () => {
  assert.throws(()=>httpRows([row(-1)]));
  assert.throws(()=>httpRows(Array(1000).fill(row())));
  assert.throws(()=>httpRows([{...row(),dimensions:{datetime:'bad'}}]));
  assert.throws(()=>webRows([{count:4,dimensions:{datetimeHour:'bad'},sum:{visits:2}}],'datetimeHour',true));
  assert.throws(()=>webRows([{count:4,dimensions:{requestHost:'x'},sum:{}}],'requestHost'));
});
test('empty successful datasets remain valid empty reports', async () => {
  assert.deepEqual(httpRows([]),[]);
  const result=await collectAccount([{id:'a',name:'a.example'}],async()=>[]);
  assert.equal(result.sites[0].requests,0);
  assert.equal(result.failures.length,0);
});
test('web totals and top lists use independent grouping and parameterized hostname', () => {
  const query=webQuery('sensitive.example');
  assert.ok(!query.includes('sensitive.example'));
  assert.ok(query.includes('requestHost: $host'));
  assert.ok(query.includes('series: rumPageloadEventsAdaptiveGroups(limit: 1000'));
  assert.ok(query.includes('paths: rumPageloadEventsAdaptiveGroups(limit: 10'));
  assert.ok(!webQuery('').includes('$host'));
  assert.deepEqual(webRows([{dimensions:{requestHost:'example.com'},count:14,sum:{visits:6}}],'requestHost'),[{label:'example.com',views:14,visits:6}]);
});
