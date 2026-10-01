import { describe, expect, it } from "vitest";
import {
  logQueryRequest,
  traceRequest,
  logRowsSchema,
  logpushJobsSchema,
  traceResultSchema,
} from "./investigate";
const context = { accountId: "account", profile: "work", zoneId: "zone" };
describe("investigation requests and responses", () => {
  it("keeps query scope and SQL separate from CLI arguments", () => {
    expect(
      logQueryRequest(context, " SELECT * FROM http_requests LIMIT 10 "),
    ).toEqual({
      context,
      path: ["logs", "query"],
      parameters: {},
      body: "SELECT * FROM http_requests LIMIT 10",
    });
    expect(() =>
      logQueryRequest(context, "DELETE FROM http_requests"),
    ).toThrow();
  });
  it("always skips the origin when simulating a request", () => {
    const request = traceRequest(
      context,
      "https://example.com/path",
      "POST",
      "nz",
      "hello",
    );
    expect(request.context.zoneId).toBeUndefined();
    expect(request.body).toEqual({
      url: "https://example.com/path",
      method: "POST",
      skip_response: true,
      context: { geoloc: { iso_code: "NZ" } },
      body: { plain_text: "hello" },
    });
    expect(() =>
      traceRequest(context, "file:///tmp/file", "GET", "", ""),
    ).toThrow();
    expect(() =>
      traceRequest(context, "https://user:password@example.com", "GET", "", ""),
    ).toThrow();
    expect(() =>
      traceRequest(context, "https://example.com", "GET", "New Zealand", ""),
    ).toThrow();
  });
  it("rejects malformed responses instead of showing empty successes", () => {
    expect(() => logRowsSchema.parse({ error: "denied" })).toThrow();
    expect(() => logpushJobsSchema.parse([{ name: "missing id" }])).toThrow();
    expect(
      traceResultSchema.parse({
        trace: [{ matched: false, trace: [{ matched: true, action: "skip" }] }],
      }).trace,
    ).toHaveLength(1);
    expect(() => traceResultSchema.parse({ success: true })).toThrow();
  });
});
