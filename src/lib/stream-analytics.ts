import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import { isDesktop } from "./store";
const row = z.object({
  label: z.string(),
  minutes: z.number().finite().nonnegative(),
});
export const streamAnalyticsSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  series: z.array(row),
  videos: z.array(row),
  countries: z.array(row),
});
export type StreamAnalyticsData = z.infer<typeof streamAnalyticsSchema>;
export async function loadStreamAnalytics(
  profile: string,
  accountId: string,
  hours: number,
  video: string,
  demo = false,
): Promise<StreamAnalyticsData> {
  if (![24, 168].includes(hours)) throw Error("Choose a supported date range.");
  if (video && !/^[a-f0-9]{32}$/i.test(video))
    throw Error("Enter a 32-character video UID.");
  if (demo) {
    const end = new Date(Math.floor(Date.now() / 3600000) * 3600000);
    return streamAnalyticsSchema.parse({
      start: new Date(end.getTime() - hours * 3600000).toISOString(),
      end: end.toISOString(),
      series: [{ label: end.toISOString().slice(0, 10), minutes: 120 }],
      videos: [
        { label: video || "0123456789abcdef0123456789abcdef", minutes: 120 },
      ],
      countries: [{ label: "NZ", minutes: 120 }],
    });
  }
  if (!isDesktop) throw Error("Open the desktop app to load Stream analytics.");
  return streamAnalyticsSchema.parse(
    await invoke("site_analytics", {
      profile,
      accountId,
      kind: "stream",
      hours,
      host: video,
    }),
  );
}
