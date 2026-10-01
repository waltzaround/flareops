import { describe, expect, it } from "vitest";
import { operationRequest, pageOperations } from "./page-operations";
import schemas from "./page-operation-schemas.json";
import {
  operationParameters,
  resourceOperationValues,
  resourceReadRequest,
} from "./page-operations";
import type { CommandSchema } from "./types";
const context = { accountId: "account", profile: "profile", zoneId: "zone" };
const schema: CommandSchema = {
  httpMethod: "GET",
  path: "/zones/{zone_id}",
  pathParams: [
    { name: "zone_id", type: "string", required: true },
    { name: "id", type: "string", required: true },
  ],
  queryParams: [
    { name: "page", type: "integer" },
    { name: "enabled", type: "boolean" },
  ],
  hasRequestBody: false,
  requestBodyFields: [],
};
const operation = { label: "Read", command: "example get" };
describe("native page operations", () => {
  it("only automatically loads complete reads in the selected account", () => {
    const details = pageOperations.RealtimeKit[0];
    const definition = (schemas as Record<string, CommandSchema>)[
      details.command
    ];
    expect(
      resourceReadRequest(details, definition, context, { app_id: "app-123" }),
    ).toMatchObject({
      context: { accountId: "account", profile: "profile" },
      parameters: { app_id: "app-123" },
    });
    expect(
      resourceReadRequest(details, definition, context, {}),
    ).toBeUndefined();
    expect(
      resourceReadRequest(
        details,
        definition,
        { ...context, accountId: "" },
        { app_id: "app-123" },
      ),
    ).toBeUndefined();
    expect(
      resourceReadRequest(details, undefined, context, { app_id: "app-123" }),
    ).toBeUndefined();
    const create = pageOperations.RealtimeKit.find((o) =>
      o.command.endsWith("create"),
    )!;
    expect(
      resourceReadRequest(
        create,
        (schemas as Record<string, CommandSchema>)[create.command],
        context,
        { app_id: "app-123" },
      ),
    ).toBeUndefined();
    const meeting = pageOperations.RealtimeKit.find(
      (o) => o.command === "realtime kit meetings get",
    )!;
    expect(
      resourceReadRequest(
        meeting,
        (schemas as Record<string, CommandSchema>)[meeting.command],
        context,
        { app_id: "app-123" },
      ),
    ).toBeUndefined();
  });
  it("prefills resource identifiers and preserves the AI Search namespace", () => {
    expect(
      resourceOperationValues("AI Search", "search-id", "production"),
    ).toEqual({ id: "search-id", name: "production" });
    expect(resourceOperationValues("AI Gateway", "gateway")).toEqual({
      id: "gateway",
      gateway_id: "gateway",
    });
    expect(
      resourceOperationValues("Models", "uuid", "default", "@cf/example/model"),
    ).toEqual({ model: "@cf/example/model" });
    expect(resourceOperationValues("Workers AI", "task-id")).toBeUndefined();
    for (const [page, operations] of Object.entries(pageOperations)) {
      const initial = resourceOperationValues(page, "resource-id");
      if (!initial) continue;
      const schema = (schemas as Record<string, CommandSchema>)[
        operations[0].command
      ];
      for (const p of operationParameters(schema).filter((p) => p.required))
        expect(initial[p.name], `${page}: ${p.name}`).toBeTruthy();
    }
  });
  it("only sends fields belonging to the selected operation", () => {
    const op = pageOperations["AI Gateway"][1];
    const schema = (schemas as Record<string, CommandSchema>)[op.command];
    expect(
      operationRequest(
        op,
        schema,
        context,
        resourceOperationValues("AI Gateway", "gateway")!,
        "{}",
      ).parameters,
    ).toEqual({ gateway_id: "gateway" });
  });
  it("has a verified bundled schema for every configured operation", () => {
    for (const operations of Object.values(pageOperations))
      for (const operation of operations) {
        const schema = (schemas as Record<string, CommandSchema>)[
          operation.command
        ];
        expect(schema?.httpMethod, operation.command).toBeTruthy();
        for (const required of operation.required ?? [])
          expect(
            operationParameters(schema).some((p) => p.name === required),
          ).toBe(true);
      }
  });
  it("keeps account operations scoped to the account even with a zone selected elsewhere", () => {
    const schema = (schemas as Record<string, CommandSchema>)[
      "accounts subscriptions get"
    ];
    const request = operationRequest(
      { label: "Subscriptions", command: "accounts subscriptions get" },
      schema,
      context,
      {},
      "{}",
    );
    expect(request.context.zoneId).toBeUndefined();
    expect(
      operationParameters(schema).some((p) =>
        p.name.startsWith("account_or_zone"),
      ),
    ).toBe(false);
  });
  it("retains selected context and parses typed parameters", () => {
    expect(
      operationRequest(
        operation,
        schema,
        context,
        { id: "resource", page: "2", enabled: "false" },
        "{}",
      ),
    ).toEqual({
      path: ["example", "get"],
      context,
      parameters: { id: "resource", page: 2, enabled: false },
    });
  });
  it("requires resource and zone selection and rejects invalid numbers", () => {
    expect(() =>
      operationRequest(operation, schema, context, {}, "{}"),
    ).toThrow("id is required");
    expect(() =>
      operationRequest(
        operation,
        schema,
        { ...context, zoneId: undefined },
        { id: "x" },
        "{}",
      ),
    ).toThrow("Select a zone");
    for (const page of ["NaN", "Infinity", "1.5"])
      expect(() =>
        operationRequest(operation, schema, context, { id: "x", page }, "{}"),
      ).toThrow("integer");
  });
  it("requires a domain even when the CLI marks it optional", () => {
    const lookup = pageOperations["Threat intelligence"][0];
    expect(() =>
      operationRequest(
        lookup,
        {
          ...schema,
          pathParams: [],
          queryParams: [{ name: "domain", type: "string" }],
        },
        context,
        {},
        "{}",
      ),
    ).toThrow("domain is required");
  });
  it("keeps SQL as plain text and validates configuration JSON", () => {
    const sql = pageOperations["Analytics Engine"][0];
    const s = {
      ...schema,
      pathParams: [],
      queryParams: [],
      hasRequestBody: true,
    };
    expect(
      operationRequest(sql, s, context, {}, "SELECT 1 FORMAT JSON").body,
    ).toBe("SELECT 1 FORMAT JSON");
    expect(() =>
      operationRequest(sql, s, context, {}, "DELETE FROM events"),
    ).toThrow("SELECT");
    expect(() =>
      operationRequest(operation, s, context, {}, "bad JSON"),
    ).toThrow();
  });
});
