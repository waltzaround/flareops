import { describe, expect, it } from "vitest";
import { describeCron, nextCronRun, cronOutcome } from "./cron";

describe("Cloudflare cron presentation", () => {
  const now = new Date("2026-10-01T09:00:00Z");
  it("describes minute, daily and monthly schedules", () => {
    expect(describeCron("*/10 * * * *")).toBe("Run every 10 minutes");
    expect(describeCron("0 18 * * *")).toBe("Run every day at 18:00");
    expect(describeCron("30 9 1 * *")).toContain("day 1 of the month");
    expect(nextCronRun("30 9 1 * *", now)?.toISOString()).toBe(
      "2026-10-01T09:30:00.000Z",
    );
    expect(nextCronRun("0 9 1 * *", now)?.toISOString()).toBe(
      "2026-11-01T09:00:00.000Z",
    );
  });
  it("uses Cloudflare weekday numbers, including Quartz extensions", () => {
    expect(describeCron("0 17 * * 1")).toContain("Sunday");
    expect(nextCronRun("0 17 * * 1", now)?.toISOString()).toBe(
      "2026-10-04T17:00:00.000Z",
    );
    expect(nextCronRun("0 18 * * 6L", now)?.toISOString()).toBe(
      "2026-10-30T18:00:00.000Z",
    );
    expect(nextCronRun("59 23 LW * *", now)?.toISOString()).toBe(
      "2026-10-30T23:59:00.000Z",
    );
  });
  it("matches either day field when both are restricted, as Cloudflare does", () => {
    expect(nextCronRun("0 9 15 * MON", now)?.toISOString()).toBe(
      "2026-10-05T09:00:00.000Z",
    );
  });
  it("handles invalid schedules and preserves unknown outcomes", () => {
    expect(nextCronRun("not a cron", now)).toBeNull();
    expect(cronOutcome("success")).toBe("Success");
    expect(cronOutcome("exceededCpu")).toBe("CPU limit exceeded");
    expect(cronOutcome("newStatus")).toBe("New Status");
  });
});
