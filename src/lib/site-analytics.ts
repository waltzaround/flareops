import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { isDesktop } from "./store";
const metric = z.number().finite().nonnegative();
const period = { start: z.string().datetime(), end: z.string().datetime() };
const httpMetrics = {
  requests: metric,
  bytes: metric,
  cachedRequests: metric,
  threats: metric,
};
export const accountAnalyticsSchema = z.object({
  ...period,
  series: z.array(z.object({ time: z.string(), ...httpMetrics })),
  sites: z.array(z.object({ label: z.string(), ...httpMetrics })),
  failures: z.array(z.string()),
  totalZones: metric,
});
const webRow = z.object({ label: z.string(), views: metric, visits: metric });
export const webAnalyticsSchema = z.object({
  ...period,
  series: z.array(webRow),
  hosts: z.array(webRow),
  paths: z.array(webRow),
  referrers: z.array(webRow),
  countries: z.array(webRow),
  browsers: z.array(webRow),
});
export type AccountAnalytics = z.infer<typeof accountAnalyticsSchema>;
export type WebAnalytics = z.infer<typeof webAnalyticsSchema>;
export function sampleAnalytics(
  kind: "account" | "web",
  hours: number,
  host: string,
) {
  const end = new Date(Math.floor(Date.now() / 3600000) * 3600000);
  const start = new Date(end.getTime() - hours * 3600000);
  const period = { start: start.toISOString(), end: end.toISOString() };
  const series = Array.from({ length: hours }, (_, i) => ({
    time: new Date(start.getTime() + i * 3600000).toISOString(),
    requests: Math.round(750 + 480 * Math.sin(i / 4) + (i % 7) * 40),
    bytes: ((i % 5) + 1) * 2300000,
    cachedRequests: Math.round(
      (750 + 480 * Math.sin(i / 4) + (i % 7) * 40) * 0.78,
    ),
    threats: i % 9,
  }));
  if (kind === "account") {
    const totals = series.reduce(
      (a, b) => ({
        requests: a.requests + b.requests,
        bytes: a.bytes + b.bytes,
        cachedRequests: a.cachedRequests + b.cachedRequests,
        threats: a.threats + b.threats,
      }),
      { requests: 0, bytes: 0, cachedRequests: 0, threats: 0 },
    );
    return {
      ...period,
      series,
      sites: [{ label: "example.com", ...totals }],
      failures: [],
      totalZones: 1,
    };
  }
  const rows = series.map((r, i) => ({
    label: r.time,
    views: Math.round(r.requests / 3),
    visits: Math.round(r.requests / 5),
  }));
  const views = rows.reduce((n, r) => n + r.views, 0),
    visits = rows.reduce((n, r) => n + r.visits, 0);
  const breakdown = (labels: string[]) =>
    labels.map((label, i) => ({
      label,
      views: Math.floor(views * (i ? 0.3 : 0.7)),
      visits: Math.floor(visits * (i ? 0.3 : 0.7)),
    }));
  return {
    ...period,
    series: rows,
    hosts: [{ label: host || "example.com", views, visits }],
    paths: breakdown(["/", "/pricing"]),
    referrers: breakdown(["", "google.com"]),
    countries: breakdown(["New Zealand", "United States"]),
    browsers: breakdown(["Chrome", "Safari"]),
  };
}
export async function loadSiteAnalytics(
  kind: "account" | "web",
  mode: "live" | "demo",
  profile: string,
  accountId: string,
  hours: number,
  host: string,
) {
  if (mode === "demo") return sampleAnalytics(kind, hours, host);
  if (!isDesktop)
    throw Error("Open the FlareOps desktop app to load live analytics.");
  return invoke("site_analytics", { kind, profile, accountId, hours, host });
}
export function bandwidth(bytes: number) {
  if (bytes < 1000) return `${bytes.toLocaleString()} B`;
  const units = ["kB", "MB", "GB", "TB"];
  let value = bytes / 1000,
    i = 0;
  while (value >= 1000 && i < units.length - 1) {
    value /= 1000;
    i++;
  }
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${units[i]}`;
}
