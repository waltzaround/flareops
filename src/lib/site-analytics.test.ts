import { describe, expect, it } from "vitest";
import {
  accountAnalyticsSchema,
  webAnalyticsSchema,
  sampleAnalytics,
  bandwidth,
} from "./site-analytics";
describe("site analytics", () => {
  it("provides consistent sample totals for both date ranges", () => {
    for (const hours of [24, 168]) {
      const account = accountAnalyticsSchema.parse(
        sampleAnalytics("account", hours, ""),
      );
      expect(account.series).toHaveLength(hours);
      expect(account.sites[0].requests).toBe(
        account.series.reduce((n, r) => n + r.requests, 0),
      );
      const web = webAnalyticsSchema.parse(
        sampleAnalytics("web", hours, "preview.example"),
      );
      expect(web.series).toHaveLength(hours);
      expect(web.hosts[0].label).toBe("preview.example");
      expect(web.hosts[0].views).toBe(
        web.series.reduce((n, r) => n + r.views, 0),
      );
    }
  });
  it("rejects incomplete payloads and displays bandwidth with units", () => {
    expect(() => accountAnalyticsSchema.parse({ series: [] })).toThrow();
    expect(() => webAnalyticsSchema.parse({ series: [] })).toThrow();
    expect(bandwidth(0)).toBe("0 B");
    expect(bandwidth(1500000)).toBe("1.5 MB");
  });
});
