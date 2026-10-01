import { describe, it, expect } from "vitest";
import { normalizeResources, normalizePages, formatCommand } from "./cf";
import { internalUrl, parseInternalUrl } from "./types";
describe("CLI output adapters", () => {
  it("accepts a bare resource list and API result envelope", () => {
    expect(
      normalizeResources([{ id: "worker", name: "edge" }], "Workers")[0].name,
    ).toBe("edge");
    expect(
      normalizeResources(
        { result: [{ uuid: "db", name: "production" }] },
        "D1",
      )[0].id,
    ).toBe("db");
  });
  it("accepts R2 buckets without pretending malformed output is empty", () => {
    expect(
      normalizeResources({ result: { buckets: [{ name: "assets" }] } }, "R2")[0]
        .id,
    ).toBe("assets");
    expect(() => normalizeResources({ changedShape: [] }, "R2")).toThrow();
  });
  it("reads Queue identifiers and names from the CLI response", () => {
    const queue = {
      queue_id: "queue-123",
      queue_name: "events",
      created_on: "2026-10-01",
      modified_on: "2026-10-02",
      consumers: [],
      producers: [],
      settings: {},
    };
    for (const data of [[queue], { result: [queue] }]) {
      const [resource] = normalizeResources(data, "Queues");
      expect(resource).toMatchObject({
        id: "queue-123",
        name: "events",
        kind: "Queues",
        modified: "2026-10-02",
        metadata: queue,
      });
    }
    expect(normalizeResources([], "Queues")).toEqual([]);
    expect(() =>
      normalizeResources([{ queue_name: "missing-id" }], "Queues"),
    ).toThrow();
  });
  it("rejects resource responses without usable identifiers", () => {
    expect(() =>
      normalizeResources([{ description: "unknown" }], "Workers"),
    ).toThrow();
  });
  it("preserves proxy distinction and TTL", () => {
    const r = normalizeResources(
      [
        {
          id: "record",
          name: "test.example",
          type: "A",
          content: "192.0.2.10",
          proxied: false,
          ttl: 300,
        },
      ],
      "DNS",
    )[0];
    expect(r.proxied).toBe(false);
    expect(r.ttl).toBe(300);
  });
});
describe("context and navigation", () => {
  it("round-trips resource links including escaped names", () => {
    expect(
      parseInternalUrl(internalUrl("account", "Workers", "edge/api")),
    ).toEqual({ accountId: "account", page: "Workers", id: "edge/api" });
    expect(() => parseInternalUrl("https://example.com")).toThrow();
  });
  it("shows the profile, account, zone, and full JSON in reviews", () => {
    const command = formatCommand({
      path: ["dns", "records", "create"],
      context: { profile: "work", accountId: "account", zoneId: "zone" },
      parameters: {},
      body: { name: "api.example.com", type: "A", content: "192.0.2.1" },
    });
    expect(command).toContain("--profile work");
    expect(command).toContain("CLOUDFLARE_ACCOUNT_ID=account");
    expect(command).toContain("--zone zone");
    expect(command).toContain("192.0.2.1");
    expect(command).not.toContain("--force");
  });
});

it("keeps Pages projects distinct from same-name Workers", () => {
  const [p] = normalizePages([
    {
      id: "abc",
      name: "site",
      created_on: "2026-01-01",
      latest_deployment: { created_on: "2026-10-01" },
    },
  ]);
  expect(p).toMatchObject({
    id: "pages:abc",
    name: "site",
    product: "Pages",
    kind: "Workers",
    modified: "2026-10-01",
  });
  expect(
    normalizePages([
      { id: "new", name: "new-site", latest_deployment: null },
    ])[0].modified,
  ).toBe("");
  expect(() => normalizePages([{ name: "invalid" }])).toThrow();
});

describe("compute resource adapters", () => {
  it("reads container timestamps and preserves application configuration", () => {
    const application = {
      id: "app-1",
      name: "renderer",
      created_at: "2026-09-30T12:00:00Z",
      configuration: { image: "registry.example.com/renderer:v1" },
    };
    expect(
      normalizeResources({ result: [application] }, "Containers")[0],
    ).toMatchObject({
      id: "app-1",
      name: "renderer",
      modified: application.created_at,
      metadata: application,
    });
  });
  it("reads dispatch namespace IDs and names", () => {
    expect(
      normalizeResources(
        [{ namespace_id: "ns-1", namespace_name: "customers" }],
        "Workers for Platforms",
      )[0],
    ).toMatchObject({ id: "ns-1", name: "customers" });
  });
  it("supports workflow and Durable Object responses, empty lists, and links", () => {
    for (const kind of [
      "Containers",
      "Durable Objects",
      "Workflows",
      "Workers for Platforms",
    ] as const) {
      expect(normalizeResources({ result: [] }, kind)).toEqual([]);
      expect(() =>
        normalizeResources({ error: "permission denied" }, kind),
      ).toThrow();
      expect(
        parseInternalUrl(internalUrl("account", kind, "example/name")),
      ).toEqual({ accountId: "account", page: kind, id: "example/name" });
    }
    expect(
      normalizeResources(
        [{ id: "ns", name: "Sessions", class: "SessionStore", script: "api" }],
        "Durable Objects",
      )[0].metadata?.class,
    ).toBe("SessionStore");
    expect(
      normalizeResources(
        [{ id: "wf", name: "report", class_name: "Report" }],
        "Workflows",
      )[0].name,
    ).toBe("report");
  });
});
