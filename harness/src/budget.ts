import { DurableObject } from "cloudflare:workers";
import { z } from "zod";
import type { Env } from "./env";
export const limitsSchema = z.object({
  dailyUsd: z.number().min(0).max(10000),
  monthlyUsd: z.number().min(0).max(100000),
  concurrentRuns: z.number().int().min(1).max(2),
});
const defaults = { dailyUsd: 5, monthlyUsd: 50, concurrentRuns: 2 };
export const MODEL = "@cf/moonshotai/kimi-k2.7-code";
// USD millionths; uncached input is conservative when the provider caches tokens.
export const price = (input: number, output: number) =>
  Math.ceil(input * 0.95 + output * 4);
export const CALL_RESERVE = price(262144, 4096);
export type Usage = {
  inputTokens: number;
  outputTokens: number;
  estimatedMicrousd: number;
  reservedMicrousd: number;
};
const empty = (): Usage => ({
  inputTokens: 0,
  outputTokens: 0,
  estimatedMicrousd: 0,
  reservedMicrousd: 0,
});
export class ControlError extends Error {}
export const budget = (env: Env) =>
  env.BUDGET.get(env.BUDGET.idFromName(env.ACCOUNT_ID));
export class Budget extends DurableObject<Env> {
  async status() {
    const date = new Date().toISOString();
    const limits =
      (await this.ctx.storage.get<typeof defaults>("limits")) || defaults;
    const leases =
      (await this.ctx.storage.get<Record<string, number>>("leases")) || {};
    return {
      limits,
      day: date.slice(0, 10),
      month: date.slice(0, 7),
      dailyMicrousd:
        (await this.ctx.storage.get<number>("day:" + date.slice(0, 10))) || 0,
      monthlyMicrousd:
        (await this.ctx.storage.get<number>("month:" + date.slice(0, 7))) || 0,
      activeRuns: Object.values(leases).filter((expiry) => expiry > Date.now())
        .length,
    };
  }
  async configure(input: z.infer<typeof limitsSchema>) {
    await this.ctx.storage.put("limits", limitsSchema.parse(input));
    return this.status();
  }
  async acquire(run: string) {
    return this.ctx.storage.transaction(async (s) => {
      const limits = (await s.get<typeof defaults>("limits")) || defaults;
      const leases = (await s.get<Record<string, number>>("leases")) || {};
      for (const [id, expiry] of Object.entries(leases))
        if (expiry <= Date.now()) delete leases[id];
      if (!leases[run] && Object.keys(leases).length >= limits.concurrentRuns)
        return false;
      leases[run] = Date.now() + 30 * 60000;
      await s.put("leases", leases);
      return true;
    });
  }
  async release(run: string) {
    await this.ctx.storage.transaction(async (s) => {
      const leases = (await s.get<Record<string, number>>("leases")) || {};
      delete leases[run];
      await s.put("leases", leases);
    });
  }
  async usage(run: string): Promise<Usage> {
    return (await this.ctx.storage.get<Usage>("run:" + run)) || empty();
  }
  async reserve(run: string, call: string, model: string) {
    if (model !== MODEL) return false; // Fail closed until a model has a reviewed price and context limit.
    return this.ctx.storage.transaction(async (s) => {
      const leases = (await s.get<Record<string, number>>("leases")) || {};
      if (!leases[run] || leases[run] <= Date.now()) return false;
      if (await s.get("call:" + call)) return false; // Never reuse a reservation for a replayed provider call.
      const limits = (await s.get<typeof defaults>("limits")) || defaults;
      const date = new Date().toISOString(),
        day = "day:" + date.slice(0, 10),
        month = "month:" + date.slice(0, 7);
      const daily = (await s.get<number>(day)) || 0,
        monthly = (await s.get<number>(month)) || 0;
      if (
        daily + CALL_RESERVE > Math.floor(limits.dailyUsd * 1e6) ||
        monthly + CALL_RESERVE > Math.floor(limits.monthlyUsd * 1e6)
      )
        return false;
      const usage = (await s.get<Usage>("run:" + run)) || empty();
      usage.reservedMicrousd += CALL_RESERVE;
      await s.put({
        [day]: daily + CALL_RESERVE,
        [month]: monthly + CALL_RESERVE,
        ["run:" + run]: usage,
        ["call:" + call]: { run, day, month, settled: false },
      });
      return true;
    });
  }
  async settle(call: string, input: number, output: number) {
    if (![input, output].every((n) => Number.isSafeInteger(n) && n >= 0))
      return;
    await this.ctx.storage.transaction(async (s) => {
      const item = await s.get<{
        run: string;
        day: string;
        month: string;
        settled: boolean;
      }>("call:" + call);
      if (!item || item.settled) return;
      const cost = price(input, output),
        adjustment = cost - CALL_RESERVE;
      const usage = (await s.get<Usage>("run:" + item.run)) || empty();
      usage.inputTokens += input;
      usage.outputTokens += output;
      usage.estimatedMicrousd += cost;
      usage.reservedMicrousd -= CALL_RESERVE;
      await s.put({
        [item.day]: ((await s.get<number>(item.day)) || 0) + adjustment,
        [item.month]: ((await s.get<number>(item.month)) || 0) + adjustment,
        ["run:" + item.run]: usage,
        ["call:" + call]: { ...item, settled: true },
      });
    });
  }
}
