import cronstrue from "cronstrue";
import { Cron } from "croner";

export function describeCron(expression: string): string {
  try {
    const description = cronstrue.toString(expression, {
      dayOfWeekStartIndexZero: false,
      use24HourTimeFormat: true,
      logicalAndDayFields: false,
    });
    const fields = expression.trim().split(/\s+/);
    const daily =
      fields.length === 5 &&
      fields.slice(2).every((field) => field === "*") &&
      fields.slice(0, 2).every((field) => /^\d+$/.test(field));
    if (daily)
      return `Run every day ${description.charAt(0).toLowerCase()}${description.slice(1)}`;
    return `Run ${description.charAt(0).toLowerCase()}${description.slice(1)}`;
  } catch {
    return expression;
  }
}

export function nextCronRun(expression: string, now = new Date()): Date | null {
  try {
    // Cloudflare uses Quartz weekdays (1 = Sunday) and evaluates in UTC.
    return new Cron(expression, {
      timezone: "UTC",
      alternativeWeekdays: true,
      domAndDow: false,
    }).nextRun(now);
  } catch {
    return null;
  }
}

export function cronOutcome(status: string): string {
  const labels: Record<string, string> = {
    success: "Success",
    ok: "Success",
    exception: "Exception",
    exceededCpu: "CPU limit exceeded",
    exceededMemory: "Memory limit exceeded",
    canceled: "Canceled",
    cancelled: "Canceled",
    internalError: "Internal error",
  };
  return (
    labels[status] ??
    status
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/^./, (c) => c.toUpperCase())
  );
}
