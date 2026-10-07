import { describe, it, expect, vi } from 'vitest';
vi.mock('cloudflare:workers', () => ({ DurableObject: class { constructor(public ctx: any, public env: any) {} } }));
import { Budget, MODEL, CALL_RESERVE, price } from './budget';
function create() {
  const values = new Map<string, unknown>();
  let chain = Promise.resolve();
  const storage: any = { get: async (k: string) => structuredClone(values.get(k)), put: async (key: string | object, value: unknown) => {
    if (typeof key === 'string') values.set(key, structuredClone(value));
    else Object.entries(key).forEach(([k,v]) => values.set(k, structuredClone(v)));
  }, transaction: (f: any) => { const result = chain.then(() => f(storage)); chain = result.catch(() => {}); return result; } };
  return new Budget({ storage } as any, {} as any);
}
describe('account budget', () => {
  it('serializes concurrent admissions across projects and releases slots', async () => {
    const b = create();
    const admitted = await Promise.all(['profile-a:1', 'profile-b:2', 'profile-a:3'].map(id => b.acquire(id)));
    expect(admitted.filter(Boolean)).toHaveLength(2);
    await b.release('profile-a:1'); expect(await b.acquire('profile-a:3')).toBe(true);
  });
  it('reserves before calls and prevents concurrent overspending', async () => {
    const b = create(); await b.configure({ dailyUsd: CALL_RESERVE / 1e6 + 0.01, monthlyUsd: 50, concurrentRuns: 2 });
    await b.acquire('run');
    expect(await Promise.all(['one', 'two'].map(call => b.reserve('run', call, MODEL)))).toEqual([true, false]);
    expect(await b.reserve('run', 'one', MODEL)).toBe(false);
    await b.settle('one', 1000, 100);
    expect((await b.status()).dailyMicrousd).toBe(price(1000,100));
    await b.settle('one', 1000, 100); // duplicate delivery must not refund twice
    expect((await b.usage('run')).estimatedMicrousd).toBe(price(1000,100));
    expect(await b.reserve('run', 'three', MODEL)).toBe(true);
  });
  it('retains unknown usage and fails closed on unpriced models and no lease', async () => {
    const b = create();
    expect(await b.reserve('run', 'a', MODEL)).toBe(false);
    await b.acquire('run'); expect(await b.reserve('run', 'a', 'unknown')).toBe(false);
    expect(await b.reserve('run', 'a', MODEL)).toBe(true);
    await b.settle('a', NaN, 10);
    expect((await b.usage('run')).reservedMicrousd).toBe(CALL_RESERVE);
    await b.configure({ dailyUsd: 0, monthlyUsd: 50, concurrentRuns: 2 });
    expect(await b.reserve('run', 'b', MODEL)).toBe(false);
  });
  it('enforces monthly budget independently of the daily allowance', async () => {
    const b = create(); await b.configure({ dailyUsd: 100, monthlyUsd: 0, concurrentRuns: 2 });
    await b.acquire('run'); expect(await b.reserve('run', 'a', MODEL)).toBe(false);
  });
  it('settles against the original UTC day and month after rollover', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-31T23:59:00Z'));
      const b = create(); await b.acquire('run'); await b.reserve('run','a',MODEL);
      vi.setSystemTime(new Date('2026-11-01T00:01:00Z'));
      await b.settle('a', 1000, 100);
      expect((await b.status()).dailyMicrousd).toBe(0);
      expect((await b.status()).monthlyMicrousd).toBe(0);
      expect((await b.usage('run')).estimatedMicrousd).toBe(1350);
      vi.setSystemTime(new Date('2026-11-01T01:00:00Z'));
      expect(await b.reserve('run','b',MODEL)).toBe(false);
    } finally { vi.useRealTimers(); }
  });
});
