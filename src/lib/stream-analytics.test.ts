import { describe, expect, it, vi } from "vitest";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
import { loadStreamAnalytics, streamAnalyticsSchema } from "./stream-analytics";
describe("Stream analytics", () => {
  it("validates ranges and video IDs before running a query", async () => {
    await expect(loadStreamAnalytics("p", "a", 1, "", true)).rejects.toThrow(
      "date range",
    );
    await expect(
      loadStreamAnalytics("p", "a", 24, "bad-uid", true),
    ).rejects.toThrow("video UID");
  });
  it("provides consistent explicit sample data for both ranges", async () => {
    for (const hours of [24, 168]) {
      const data = await loadStreamAnalytics(
        "p",
        "a",
        hours,
        "0123456789abcdef0123456789abcdef",
        true,
      );
      expect(Date.parse(data.end) - Date.parse(data.start)).toBe(
        hours * 3600000,
      );
      expect(data.series.reduce((sum, r) => sum + r.minutes, 0)).toBe(
        data.videos[0].minutes,
      );
      expect(data.countries[0].minutes).toBe(data.videos[0].minutes);
    }
  });
  it("rejects incompatible analytics responses", () => {
    expect(() => streamAnalyticsSchema.parse({ series: [] })).toThrow();
  });
});
