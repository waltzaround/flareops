import { describe, expect, it } from "vitest";
import { formatMetadataValue, formatTimestamp } from "./utils";

describe("system timezone timestamps", () => {
  it("formats fractional seconds in the system timezone with a zone label", () => {
    for (const value of [
      "2024-01-12T10:10:17.200192Z",
      "2024-01-12T09:58:15.178887Z",
    ]) {
      const date = new Date(value);
      const time = [date.getHours(), date.getMinutes(), date.getSeconds()]
        .map((part) => String(part).padStart(2, "0"))
        .join(":");
      const zone = new Intl.DateTimeFormat("en-GB", { timeZoneName: "short" })
        .formatToParts(date)
        .find((part) => part.type === "timeZoneName")!.value;
      const day = date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      expect(formatMetadataValue(value)).toBe(`${day}, ${time} ${zone}`);
    }
  });
  it("displays the same instant identically regardless of source offset", () => {
    expect(formatTimestamp("2024-01-12T10:10:17+13:00")).toBe(
      formatTimestamp("2024-01-11T21:10:17Z"),
    );
  });
  it("preserves other metadata and handles missing or invalid dates", () => {
    expect(formatTimestamp("")).toBe("—");
    expect(formatTimestamp("unknown")).toBe("unknown");
    expect(formatMetadataValue("2024-99-12T10:10:17Z")).toBe(
      "2024-99-12T10:10:17Z",
    );
    expect(formatMetadataValue("12345")).toBe("12345");
    expect(formatMetadataValue(true)).toBe("true");
    expect(formatMetadataValue({ enabled: true })).toBe('{"enabled":true}');
  });
});
